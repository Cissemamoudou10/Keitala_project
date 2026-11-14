const AVEC_ACCENTS = "àâäáãåéèêëíìîïóòôöõúùûüçñÿ";
const SANS_ACCENTS = "aaaaaaeeeeiiiiooooouuuucny";

/** Minuscules sans accents, comme la recherche de l'API (« Attiéké » → « attieke »). */
export function simplifier(texte: string): string {
  let resultat = "";
  for (const caractere of texte.toLowerCase()) {
    const position = AVEC_ACCENTS.indexOf(caractere);
    resultat += position >= 0 ? SANS_ACCENTS[position] : caractere;
  }
  return resultat;
}
