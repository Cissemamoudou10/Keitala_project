/**
 * Calcul exact sur les chaînes décimales de l'API (règle 10 : jamais de flottant).
 * Sert aux conséquences affichées en direct (« 3 sacs = 150 kg ») ; les valeurs qui
 * font foi restent celles calculées par l'API et la base.
 */

type Echelle = { valeur: bigint; decimales: number };

function lire(texte: string): Echelle | null {
  const correspondance = /^(-?)(\d*)(?:[.,](\d*))?$/.exec(texte.trim());
  if (!correspondance || (!correspondance[2] && !correspondance[3])) return null;
  const [, signe, entier = "", fraction = ""] = correspondance;
  const valeur = BigInt(`${entier || "0"}${fraction}`);
  return { valeur: signe ? -valeur : valeur, decimales: fraction.length };
}

/** Produit exact a × b, arrondi au plus proche (demi vers le haut) à `decimales` chiffres. */
export function multiplierDecimaux(a: string, b: string, decimales = 3): string | null {
  const x = lire(a);
  const y = lire(b);
  if (!x || !y) return null;
  const produit = x.valeur * y.valeur;
  const echelle = x.decimales + y.decimales;

  let resultat: bigint;
  if (echelle <= decimales) {
    resultat = produit * 10n ** BigInt(decimales - echelle);
  } else {
    const diviseur = 10n ** BigInt(echelle - decimales);
    const negatif = produit < 0n;
    const absolu = negatif ? -produit : produit;
    let quotient = absolu / diviseur;
    if ((absolu % diviseur) * 2n >= diviseur) quotient += 1n;
    resultat = negatif ? -quotient : quotient;
  }

  const negatif = resultat < 0n;
  const chiffres = (negatif ? -resultat : resultat).toString().padStart(decimales + 1, "0");
  const entier = chiffres.slice(0, chiffres.length - decimales);
  const fraction = decimales > 0 ? `.${chiffres.slice(-decimales)}` : "";
  return `${negatif ? "-" : ""}${entier}${fraction}`;
}

/** a < b, sur deux chaînes décimales (null si l'une est illisible). */
export function estInferieur(a: string, b: string): boolean | null {
  const x = lire(a);
  const y = lire(b);
  if (!x || !y) return null;
  const echelle = Math.max(x.decimales, y.decimales);
  return (
    x.valeur * 10n ** BigInt(echelle - x.decimales) <
    y.valeur * 10n ** BigInt(echelle - y.decimales)
  );
}

/** Valeur de l'API prête à être modifiée dans un champ : « 250.000 » → « 250 », « 12.500 » → « 12,5 ». */
export function enSaisie(valeur: string): string {
  const texte = valeur.trim();
  const sansZeros = texte.includes(".") ? texte.replace(/0+$/, "").replace(/\.$/, "") : texte;
  return sansZeros.replace(".", ",");
}

/** Différence exacte a − b (null si l'une est illisible), sans zéros inutiles. */
export function soustraireDecimaux(a: string, b: string): string | null {
  const x = lire(a);
  const y = lire(b);
  if (!x || !y) return null;
  const echelle = Math.max(x.decimales, y.decimales);
  const difference =
    x.valeur * 10n ** BigInt(echelle - x.decimales) -
    y.valeur * 10n ** BigInt(echelle - y.decimales);
  const negatif = difference < 0n;
  const chiffres = (negatif ? -difference : difference).toString().padStart(echelle + 1, "0");
  const entier = chiffres.slice(0, chiffres.length - echelle);
  const fraction = echelle > 0 ? chiffres.slice(-echelle).replace(/0+$/, "") : "";
  const texte = fraction ? `${entier}.${fraction}` : entier;
  return negatif && texte !== "0" ? `-${texte}` : texte;
}

/** Somme exacte de chaînes décimales (null si l'une est illisible), sans zéros inutiles. */
export function additionnerDecimaux(valeurs: string[]): string | null {
  let total = "0";
  for (const valeur of valeurs) {
    const negatif = valeur.trim().startsWith("-");
    const oppose = negatif ? valeur.trim().slice(1) : `-${valeur.trim()}`;
    const suivant = soustraireDecimaux(total, oppose);
    if (suivant === null) return null;
    total = suivant;
  }
  return total;
}
