/**
 * Montant en toutes lettres (charte, section 9) : « Deux millions trente mille francs CFA ».
 * Orthographe traditionnelle : « vingt et un », « quatre-vingts », « deux cents »,
 * « deux cent mille », « mille » invariable, « millions » au pluriel.
 * Travaille sur la chaîne décimale de l'API, sans nombre flottant.
 */

const UNITES = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];
const DIZAINES = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99. `finale` : rien ne suit (« quatre-vingts » prend alors un s). */
function moinsDeCent(n: number, finale: boolean): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const dizaine = Math.floor(n / 10);
  const unite = n % 10;
  if (dizaine === 7 || dizaine === 9) {
    // 70-79 : soixante-dix… ; 90-99 : quatre-vingt-dix…
    const base = dizaine === 7 ? "soixante" : "quatre-vingt";
    const reste = moinsDeCent(10 + unite, false);
    return dizaine === 7 && unite === 1 ? `${base} et ${reste}` : `${base}-${reste}`;
  }
  if (dizaine === 8) {
    if (unite === 0) return finale ? "quatre-vingts" : "quatre-vingt";
    return `quatre-vingt-${UNITES[unite]}`;
  }
  if (unite === 0) return DIZAINES[dizaine];
  if (unite === 1) return `${DIZAINES[dizaine]} et un`;
  return `${DIZAINES[dizaine]}-${UNITES[unite]}`;
}

/** 0 à 999. `finale` : aucun mot ne suit, ou seulement « millions »/« milliards ». */
function moinsDeMille(n: number, finale: boolean): string {
  const centaine = Math.floor(n / 100);
  const reste = n % 100;
  const mots: string[] = [];
  if (centaine > 0) {
    if (centaine === 1) mots.push("cent");
    else mots.push(`${UNITES[centaine]} ${reste === 0 && finale ? "cents" : "cent"}`);
  }
  if (reste > 0 || centaine === 0) mots.push(moinsDeCent(reste, finale));
  return mots.join(" ");
}

const ECHELLES: { valeur: bigint; singulier: string; pluriel: string }[] = [
  { valeur: 1_000_000_000n, singulier: "milliard", pluriel: "milliards" },
  { valeur: 1_000_000n, singulier: "million", pluriel: "millions" },
];

/** Entier positif en lettres (jusqu'à 999 milliards et au-delà). */
export function entierEnLettres(entier: bigint): string {
  if (entier === 0n) return "zéro";
  const mots: string[] = [];
  let reste = entier;
  for (const echelle of ECHELLES) {
    const nombre = reste / echelle.valeur;
    reste %= echelle.valeur;
    if (nombre > 0n) {
      // « millions » est un nom : « deux cents millions », « quatre-vingts millions »
      const texte = nombre < 1000n ? moinsDeMille(Number(nombre), true) : entierEnLettres(nombre);
      mots.push(`${texte} ${nombre === 1n ? echelle.singulier : echelle.pluriel}`);
    }
  }
  const milliers = Number(reste / 1000n);
  const unites = Number(reste % 1000n);
  if (milliers > 0) {
    // « mille » est invariable et ne prend pas « un » : « mille », « deux cent mille »
    mots.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  }
  if (unites > 0) mots.push(moinsDeMille(unites, true));
  return mots.join(" ");
}

/** « 2030000 » → « Deux millions trente mille francs CFA ». Chaîne vide si illisible. */
export function montantEnLettres(valeur: string | number): string {
  const texte = String(valeur).trim().replace(",", ".");
  const correspondance = /^(-?)(\d+)(?:\.(\d*))?$/.exec(texte);
  if (!correspondance) return "";
  const [, signe, partieEntiere, fraction = ""] = correspondance;
  // FCFA sans centimes : arrondi au franc le plus proche, comme formaterMontant
  let entier = BigInt(partieEntiere);
  if (Number(fraction[0] ?? "0") >= 5) entier += 1n;

  const lettres = entierEnLettres(entier);
  // « de » devant francs après million(s)/milliard(s) seuls : « deux millions de francs »
  const de = /(millions?|milliards?)$/.test(lettres) ? " de" : "";
  const unite = entier <= 1n ? "franc CFA" : "francs CFA";
  const phrase = `${signe && entier > 0n ? "moins " : ""}${lettres}${de} ${unite}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
