# Les constantes XML ci-dessous gardent une ligne par élément, plus lisible que coupée
# ruff: noqa: E501
"""Classeur Excel (.xlsx) minimal, écrit avec la bibliothèque standard (D-036).

Un fichier .xlsx est une archive zip de quelques fichiers XML (format Office Open XML).
Une feuille, une ligne d'en-tête en gras, du texte et des nombres : c'est tout ce dont
les exports ont besoin, sans dépendance supplémentaire.
"""

import io
import zipfile
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from xml.sax.saxutils import escape

Cellule = str | int | Decimal | date | None

TYPES_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""

_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

_WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

# Style 0 : normal ; style 1 : en-tête en gras ; style 2 : nombre « # ##0 » ;
# style 3 : nombre « # ##0,000 » (quantités)
_STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.###"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>"""


def _colonne(index: int) -> str:
    """0 → A, 25 → Z, 26 → AA."""
    lettres = ""
    index += 1
    while index:
        index, reste = divmod(index - 1, 26)
        lettres = chr(65 + reste) + lettres
    return lettres


def _texte(valeur: Cellule) -> str:
    if valeur is None:
        return ""
    if isinstance(valeur, datetime):
        return valeur.strftime("%d/%m/%Y %H:%M")
    if isinstance(valeur, date):
        return valeur.strftime("%d/%m/%Y")
    return str(valeur)


def _cellule(reference: str, valeur: Cellule, entete: bool) -> str:
    if valeur is None:
        return ""
    if isinstance(valeur, int | Decimal) and not isinstance(valeur, bool) and not entete:
        # Montant entier : séparateur de milliers ; sinon jusqu'à 3 décimales (quantités)
        format_nombre = 2 if Decimal(valeur) == Decimal(valeur).to_integral_value() else 3
        return f'<c r="{reference}" s="{format_nombre}"><v>{valeur}</v></c>'
    gras = ' s="1"' if entete else ""
    contenu = escape(_texte(valeur))
    return (
        f'<c r="{reference}" t="inlineStr"{gras}><is><t xml:space="preserve">{contenu}</t></is></c>'
    )


def classeur(feuille: str, entetes: Sequence[str], lignes: Sequence[Sequence[Cellule]]) -> bytes:
    """Classeur d'une feuille : `entetes` en gras sur la première ligne, puis `lignes`."""
    toutes: list[list[Cellule]] = [list(entetes), *[list(ligne) for ligne in lignes]]
    largeurs = [
        min(60, max(10, *(len(_texte(ligne[i])) + 2 for ligne in toutes if i < len(ligne))))
        for i in range(len(entetes))
    ]
    colonnes = "".join(
        f'<col min="{i + 1}" max="{i + 1}" width="{largeur}" customWidth="1"/>'
        for i, largeur in enumerate(largeurs)
    )
    rangees = "".join(
        f'<row r="{n + 1}">'
        + "".join(_cellule(f"{_colonne(i)}{n + 1}", v, n == 0) for i, v in enumerate(ligne))
        + "</row>"
        for n, ligne in enumerate(toutes)
    )
    nom = escape(feuille[:31])
    feuille_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" '
        'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"<cols>{colonnes}</cols><sheetData>{rangees}</sheetData></worksheet>"
    )
    classeur_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{nom}" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _CONTENT_TYPES)
        archive.writestr("_rels/.rels", _RELS)
        archive.writestr("xl/workbook.xml", classeur_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", _WORKBOOK_RELS)
        archive.writestr("xl/styles.xml", _STYLES)
        archive.writestr("xl/worksheets/sheet1.xml", feuille_xml)
    return tampon.getvalue()
