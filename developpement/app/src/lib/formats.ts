/**
 * Formats d'affichage de la charte (section 8).
 *
 * L'API envoie montants et quantités en chaînes décimales ("45000.00", "48.260") :
 * on les traite comme du texte pour ne jamais passer par un nombre flottant.
 */

/** Espace insécable : sépare les milliers et colle l'unité au nombre. */
export const ESPACE_INSECABLE = " ";

type Decimal = { negatif: boolean; entier: string; fraction: string };

/** Découpe "-1234.5600" en { negatif, entier: "1234", fraction: "5600" }. Null si invalide. */
function lireDecimal(valeur: string | number): Decimal | null {
  const texte = String(valeur).trim().replace(",", ".");
  const correspondance = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(texte);
  if (!correspondance || (correspondance[2] === "" && !correspondance[3])) return null;
  const [, signe, entier, fraction = ""] = correspondance;
  return {
    negatif: signe === "-",
    entier: entier.replace(/^0+(?=\d)/, "") || "0",
    fraction,
  };
}

/** Ajoute 1 à un entier écrit en chiffres ("999" → "1000"). */
function incrementer(chiffres: string): string {
  const liste = chiffres.split("");
  for (let i = liste.length - 1; i >= 0; i--) {
    if (liste[i] !== "9") {
      liste[i] = String(Number(liste[i]) + 1);
      return liste.join("");
    }
    liste[i] = "0";
  }
  return `1${liste.join("")}`;
}

/** Arrondit au plus proche (demi vers le haut, en valeur absolue) à `decimales` chiffres. */
function arrondir(nombre: Decimal, decimales: number): Decimal {
  if (nombre.fraction.length <= decimales) return nombre;
  const garde = nombre.entier + nombre.fraction.slice(0, decimales);
  const arrondi = Number(nombre.fraction[decimales]) >= 5 ? incrementer(garde) : garde;
  const coupure = arrondi.length - decimales;
  return {
    negatif: nombre.negatif,
    entier: arrondi.slice(0, coupure) || "0",
    fraction: arrondi.slice(coupure),
  };
}

function grouperMilliers(entier: string): string {
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_INSECABLE);
}

/** Nombre au format français : milliers groupés, virgule, zéros inutiles retirés. */
function ecrireNombre(nombre: Decimal, decimalesMax: number): string {
  const arrondi = arrondir(nombre, decimalesMax);
  const fraction = arrondi.fraction.replace(/0+$/, "");
  const estNul = /^0*$/.test(arrondi.entier) && fraction === "";
  const signe = arrondi.negatif && !estNul ? "-" : "";
  return `${signe}${grouperMilliers(arrondi.entier)}${fraction ? `,${fraction}` : ""}`;
}

/** Montant en FCFA, sans décimales : "2030000" → "2 030 000 FCFA". */
export function formaterMontant(valeur: string | number): string {
  const nombre = lireDecimal(valeur);
  if (!nombre) return "";
  return `${ecrireNombre(nombre, 0)}${ESPACE_INSECABLE}FCFA`;
}

/** Montant sans l'unité, pour un tableau dont l'en-tête porte déjà « FCFA ». */
export function formaterMontantSeul(valeur: string | number): string {
  const nombre = lireDecimal(valeur);
  return nombre ? ecrireNombre(nombre, 0) : "";
}

// Unités abrégées : jamais de « s » au pluriel
const UNITES_INVARIABLES = new Set(["kg", "g", "t", "l", "L", "ml", "cl", "m", "cm"]);

/** Accorde le premier mot d'une unité : "sachet" → "sachets", "Sac 50 kg" → "Sacs 50 kg". */
function accorderUnite(unite: string, nombre: Decimal): string {
  const [premier, ...reste] = unite.split(" ");
  const pluriel =
    Number(nombre.entier) >= 2 &&
    !UNITES_INVARIABLES.has(premier) &&
    !/[sxz]$/i.test(premier);
  return [pluriel ? `${premier}s` : premier, ...reste].join(" ");
}

/** Quantité : 3 décimales au plus, unité accolée. "48.260", "kg" → "48,26 kg". */
export function formaterQuantite(valeur: string | number, unite?: string): string {
  const nombre = lireDecimal(valeur);
  if (!nombre) return "";
  const texte = ecrireNombre(nombre, 3);
  return unite ? `${texte}${ESPACE_INSECABLE}${accorderUnite(unite, nombre)}` : texte;
}

/** Conversion d'unité : "3 Sacs 50 kg = 150 kg". */
export function formaterConversion(
  quantite: string | number,
  unite: string,
  quantiteBase: string | number,
  uniteBase: string,
): string {
  return `${formaterQuantite(quantite, unite)} = ${formaterQuantite(quantiteBase, uniteBase)}`;
}

/** Pourcentage, une décimale au plus : "74.52" → "74,5 %". */
export function formaterPourcentage(valeur: string | number): string {
  const nombre = lireDecimal(valeur);
  return nombre ? `${ecrireNombre(nombre, 1)}${ESPACE_INSECABLE}%` : "";
}

// Le Mali vit à l'heure UTC toute l'année ; on fixe le fuseau pour ne pas dépendre du poste
const FUSEAU = "Africa/Bamako";

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const formatHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-11-13" (date de l'API) ou horodatage ISO → "13/11/2026". */
export function formaterDate(valeur: string): string {
  const jourSeul = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  // Une date sans heure ne doit pas glisser d'un jour selon le fuseau
  if (jourSeul) return `${jourSeul[3]}/${jourSeul[2]}/${jourSeul[1]}`;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? "" : formatDate.format(date);
}

function cleJour(date: Date): string {
  return formatDate.format(date);
}

/**
 * Date relative pour les listes : "Aujourd'hui, 14:32", "Hier", sinon "13/11/2026".
 * Afficher la date exacte en infobulle (`formaterDateHeure`).
 */
export function formaterDateRelative(valeur: string, maintenant: Date = new Date()): string {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "";
  const hier = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
  if (cleJour(date) === cleJour(maintenant)) return `Aujourd'hui, ${formatHeure.format(date)}`;
  if (cleJour(date) === cleJour(hier)) return "Hier";
  return formatDate.format(date);
}

/** "13/11/2026 à 14:32", pour une infobulle ou un détail. */
export function formaterDateHeure(valeur: string): string {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate.format(date)} à ${formatHeure.format(date)}`;
}

/** Numéro malien : "76123456" ou "+22376123456" → "+223 76 12 34 56". Sinon inchangé. */
export function formaterTelephone(valeur: string): string {
  const chiffres = valeur.replace(/[^\d+]/g, "").replace(/^(\+|00)223/, "");
  if (!/^\d{8}$/.test(chiffres)) return valeur.trim();
  return `+223 ${chiffres.replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}
