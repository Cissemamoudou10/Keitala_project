"use client";

import * as React from "react";

import { formaterDate, formaterMontant, formaterMontantSeul } from "@/lib/formats";

type Jour = { date: string; montant: string };

const HAUTEUR = 180;
const MARGE_GAUCHE = 52;
const MARGE_BAS = 24;
const MARGE_HAUT = 8;
const LARGEUR = 720;

/** Graduation « propre » : 0, puis un pas de 1, 2 ou 5 × 10ⁿ (géométrie seulement). */
function graduations(maximum: number): number[] {
  if (maximum <= 0) return [0];
  const brut = maximum / 3;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? brut;
  return Array.from({ length: Math.ceil(maximum / pas) + 1 }, (_, i) => i * pas);
}

/** « 45 000 » ; sur l'axe, au-delà de 10 000 : « 45 k », « 1,2 M ». */
function etiquetteAxe(valeur: number): string {
  if (valeur >= 1_000_000)
    return `${formaterMontantSeul(String(valeur / 1_000_000)).replace(/\s/g, "")} M`;
  if (valeur >= 10_000) return `${Math.round(valeur / 1000)} k`;
  return formaterMontantSeul(String(valeur));
}

/** Rectangle à bout arrondi (4 px) en haut, carré sur la ligne de base (charte des graphiques). */
function barre(x: number, y: number, largeur: number, hauteur: number): string {
  const r = Math.min(4, largeur / 2, hauteur);
  const bas = y + hauteur;
  return `M${x},${bas}V${y + r}Q${x},${y} ${x + r},${y}H${x + largeur - r}Q${x + largeur},${y} ${x + largeur},${y + r}V${bas}Z`;
}

/**
 * Ventes des 30 derniers jours (US-DASH-01) : une seule série, dans la couleur d'accent ;
 * un survol (ou le clavier) donne le jour et le montant ; un tableau reprend les valeurs.
 * Les montants exacts viennent de l'API ; les nombres ne servent ici qu'à la géométrie.
 */
export function GraphiqueVentes({ jours }: { jours: Jour[] }) {
  const [actif, setActif] = React.useState<number | null>(null);
  const valeurs = jours.map((j) => Number(j.montant));
  const ticks = graduations(Math.max(...valeurs, 0));
  const plafond = ticks[ticks.length - 1] || 1;
  const zone = LARGEUR - MARGE_GAUCHE;
  const pasX = zone / jours.length;
  const largeurBarre = Math.min(24, pasX - 2);
  const y = (v: number) => MARGE_HAUT + (HAUTEUR - MARGE_HAUT) * (1 - v / plafond);
  const total = jours.reduce((somme, j) => somme + Number(j.montant), 0);
  const jourActif = actif !== null ? jours[actif] : null;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">Ventes des 30 derniers jours</span>
        <span className="text-texte-2" aria-live="polite">
          {jourActif
            ? `${formaterDate(jourActif.date)} : ${formaterMontant(jourActif.montant)}`
            : `Survolez une barre pour le détail · total ${formaterMontant(String(total))}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR + MARGE_BAS}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Ventes des 30 derniers jours, total ${formaterMontant(String(total))}. Détail dans le tableau ci-dessous.`}
        onMouseLeave={() => setActif(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGE_GAUCHE}
              x2={LARGEUR}
              y1={y(t)}
              y2={y(t)}
              className="stroke-bordure"
              strokeWidth={1}
            />
            <text
              x={MARGE_GAUCHE - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-texte-2 text-[11px] tabular-nums"
            >
              {etiquetteAxe(t)}
            </text>
          </g>
        ))}
        {jours.map((jour, i) => {
          const valeur = valeurs[i];
          const x = MARGE_GAUCHE + i * pasX + (pasX - largeurBarre) / 2;
          const hauteur = HAUTEUR - y(valeur);
          // Une étiquette par semaine, comptée depuis le dernier jour (toujours étiqueté)
          const etiquette = (jours.length - 1 - i) % 7 === 0;
          return (
            <g key={jour.date}>
              {valeur > 0 && (
                <path
                  d={barre(x, y(valeur), largeurBarre, hauteur)}
                  className={actif === null || actif === i ? "fill-accent" : "fill-accent/40"}
                />
              )}
              {etiquette && (
                <text
                  x={x + largeurBarre / 2}
                  y={HAUTEUR + 16}
                  textAnchor="middle"
                  className="fill-texte-2 text-[11px]"
                >
                  {formaterDate(jour.date).slice(0, 5)}
                </text>
              )}
              {/* Zone de survol plus large que la barre : toute la colonne du jour */}
              <rect
                x={MARGE_GAUCHE + i * pasX}
                y={0}
                width={pasX}
                height={HAUTEUR}
                fill="transparent"
                onMouseEnter={() => setActif(i)}
                onFocus={() => setActif(i)}
                onBlur={() => setActif(null)}
                tabIndex={0}
                aria-label={`${formaterDate(jour.date)} : ${formaterMontant(jour.montant)}`}
              />
            </g>
          );
        })}
      </svg>
      <details className="text-texte-2">
        <summary className="cursor-pointer">Voir les valeurs en tableau</summary>
        <table className="mt-2 w-full max-w-sm tabular-nums">
          <thead>
            <tr>
              <th className="text-left font-medium">Jour</th>
              <th className="text-right font-medium">Ventes FCFA</th>
            </tr>
          </thead>
          <tbody>
            {jours.map((j) => (
              <tr key={j.date}>
                <td>{formaterDate(j.date)}</td>
                <td className="text-right">{formaterMontantSeul(j.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
