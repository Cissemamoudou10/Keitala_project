"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CLE_ARTICLES, nomComplet } from "@/components/articles/types";
import { soldeApres } from "@/components/pieces/bloc-paiements";
import { enFrancs, type Flux } from "@/components/pieces/saisie";
import { ChampMontant } from "@/components/saisie/champ-montant";
import { CLE_COMPTES, type CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appelerApi, ErreurApi } from "@/lib/api";
import { estInferieur } from "@/lib/decimal";
import { formaterDate, formaterMontant, formaterQuantite } from "@/lib/formats";
import { notifier } from "@/lib/notifications";

/** Ce que les fiches d'achat et de vente ont en commun (lecture de l'API). */
export type PieceLue = {
  id: string;
  numero: string;
  montant_total: string;
  montant_regle: string;
  reste_a_payer: string;
  lignes: {
    id: number;
    article: { designation: string; contenance: string | null; unite_base: string };
    unite: string;
    quantite: string;
    prix_unitaire: string;
    quantite_base: string;
    montant_total: string;
  }[];
  reglements: {
    id: string;
    compte: string;
    montant: string;
    date_reglement: string;
    reference_paiement: string | null;
    statut: "BROUILLON" | "VALIDE" | "ANNULE";
    auteur: string;
  }[];
};

/** Après une écriture : fiche à jour, et listes, stocks, comptes et tiers relus. */
export function useRafraichirApres<T extends { id: string }>(cle: readonly unknown[]) {
  const clientRequetes = useQueryClient();
  return async (piece: T) => {
    clientRequetes.setQueryData([...cle, piece.id], piece);
    await Promise.all(
      [cle, CLE_COMPTES, CLE_ARTICLES, ["tiers"], ["stocks"]].map((queryKey) =>
        clientRequetes.invalidateQueries({ queryKey }),
      ),
    );
  };
}

function messageDe(cause: unknown, sansDoublon: string): string {
  if (!(cause instanceof ErreurApi)) return "Une erreur inattendue est survenue.";
  return cause.statut === 0
    ? `La connexion a été perdue. Réessayez : ${sansDoublon}.`
    : cause.message;
}

export type LibellesReglement = {
  /** « Payer le fournisseur », « Encaisser le client ». */
  titre: string;
  bouton: string;
  sansDoublon: string;
  solde: (numero: string) => string;
  partiel: (montant: string, reste: string) => string;
};

/**
 * Règlement ultérieur (US-ACH-03, US-VTE-05) : pré-rempli avec le reste à payer, qu'il
 * ne peut dépasser ; clé d'idempotence propre à chaque règlement (P-009).
 */
export function ReglementUlterieur<T extends PieceLue>({
  piece,
  adresse,
  flux,
  libelles,
  onEnregistre,
}: {
  piece: T;
  /** Ex. « achats/{id}/reglements ». */
  adresse: string;
  flux: Flux;
  libelles: LibellesReglement;
  onEnregistre: (piece: T) => Promise<void>;
}) {
  const comptes = useQuery({
    queryKey: CLE_COMPTES,
    queryFn: ({ signal }) => appelerApi<CompteTresorerie[]>("tresorerie/comptes", { signal }),
  });
  const actifs = (comptes.data ?? []).filter((c) => c.est_actif);
  const [cle] = React.useState(() => crypto.randomUUID());
  const [compteId, setCompteId] = React.useState<number | null>(null);
  const [montant, setMontant] = React.useState(enFrancs(piece.reste_a_payer));
  const [reference, setReference] = React.useState("");
  const [erreurs, setErreurs] = React.useState<{ compte?: string; montant?: string }>({});
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const compte = actifs.find((c) => c.id === compteId);
  const apres = compte && montant ? soldeApres(compte, montant, flux) : null;

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: typeof erreurs = {};
    if (!compte) nouvelles.compte = "Choisissez le compte.";
    if (!montant) nouvelles.montant = "Saisissez le montant.";
    else if (estInferieur(piece.reste_a_payer, montant)) {
      nouvelles.montant = `Le reste à payer est de ${formaterMontant(piece.reste_a_payer)}. Réduisez le montant.`;
    } else if (
      flux === "decaissement" &&
      compte &&
      compte.type !== "BANQUE" &&
      estInferieur(compte.solde_actuel, montant)
    ) {
      nouvelles.montant = `Il reste ${formaterMontant(compte.solde_actuel)} sur « ${compte.nom} ». Réduisez le montant ou choisissez un autre compte.`;
    }
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;

    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await appelerApi<T>(adresse, {
        methode: "POST",
        corps: {
          cle_idempotence: cle,
          compte_id: compteId,
          montant,
          reference_paiement: reference.trim() || null,
        },
      });
      await onEnregistre(resultat);
      notifier.succes(
        /^0+(\.0+)?$/.test(resultat.reste_a_payer)
          ? libelles.solde(resultat.numero)
          : libelles.partiel(formaterMontant(montant), formaterMontant(resultat.reste_a_payer)),
      );
    } catch (cause) {
      setErreur(messageDe(cause, libelles.sansDoublon));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      onSubmit={envoyer}
      noValidate
      className="flex flex-col gap-4 rounded-md border border-bordure p-4"
      aria-label={libelles.titre}
    >
      <h3 className="font-semibold">{libelles.titre}</h3>
      <div className="flex flex-wrap items-start gap-4">
        <Champ
          libelle="Compte"
          erreur={erreurs.compte}
          aide={
            compte
              ? apres !== null
                ? `Solde après : ${formaterMontant(apres)}`
                : `Solde : ${formaterMontant(compte.solde_actuel)}`
              : undefined
          }
        >
          {(controle) => (
            <Select
              value={compteId === null ? "" : String(compteId)}
              onValueChange={(valeur) => setCompteId(Number(valeur))}
            >
              <SelectTrigger {...controle} className="w-72">
                <SelectValue placeholder="Choisir le compte" />
              </SelectTrigger>
              <SelectContent>
                {actifs.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Champ>
        <Champ libelle="Montant" erreur={erreurs.montant}>
          {(controle) => (
            <ChampMontant {...controle} className="w-44" value={montant} onChange={setMontant} />
          )}
        </Champ>
      </div>
      {compte && compte.type !== "CAISSE" && (
        <Champ libelle="Référence" facultatif>
          {(controle) => (
            <Input
              {...controle}
              autoComplete="off"
              maxLength={100}
              placeholder={compte.type === "BANQUE" ? "N° de chèque" : "N° de transaction"}
              className="w-56"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </Champ>
      )}
      {erreur && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreur}
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="principal"
          enCours={enCours}
          libelleEnCours="Enregistrement…"
        >
          {libelles.bouton}
        </Button>
      </div>
    </form>
  );
}

export type LibellesAnnulation = {
  /** « Annuler l'achat », « Annuler la vente », « Annuler le don ». */
  action: string;
  garder: string;
  description: string;
  motifManquant: string;
  annule: (numero: string) => string;
};

/** Annulation (US-ACH-04, US-VTE-06) : rappelle les effets et exige un motif (charte). */
export function AnnulationPiece<T extends { id: string; numero: string }>({
  piece,
  adresse,
  effets,
  libelles,
  onEnregistre,
}: {
  piece: T;
  adresse: string;
  /** Ce qui va se passer, une phrase par effet. */
  effets: string[];
  libelles: LibellesAnnulation;
  onEnregistre: (piece: T) => Promise<void>;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const [motif, setMotif] = React.useState("");
  const [erreurMotif, setErreurMotif] = React.useState<string | undefined>();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const annuler = async () => {
    if (motif.trim().length < 3) {
      setErreurMotif(libelles.motifManquant);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await appelerApi<T>(adresse, {
        methode: "POST",
        corps: { motif: motif.trim() },
      });
      await onEnregistre(resultat);
      notifier.succes(libelles.annule(resultat.numero));
      setOuvert(false);
    } catch (cause) {
      setErreur(messageDe(cause, "l'annulation ne sera pas faite deux fois"));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialog open={ouvert} onOpenChange={(valeur) => !enCours && setOuvert(valeur)}>
      <DialogTrigger asChild>
        <Button variant="discret">{libelles.action}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {libelles.action} {piece.numero}
          </DialogTitle>
          <DialogDescription>{libelles.description}</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-texte-2">
          {effets.map((effet) => (
            <li key={effet}>{effet}</li>
          ))}
        </ul>
        <Champ libelle="Motif" erreur={erreurMotif}>
          {(controle) => (
            <Input
              autoFocus
              maxLength={255}
              placeholder="Ex. saisi deux fois"
              value={motif}
              onChange={(e) => {
                setMotif(e.target.value);
                setErreurMotif(undefined);
              }}
              {...controle}
            />
          )}
        </Champ>
        {erreur && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreur}
          </p>
        )}
        <DialogFooter>
          <Button onClick={() => setOuvert(false)} disabled={enCours}>
            {libelles.garder}
          </Button>
          <Button variant="danger" enCours={enCours} libelleEnCours="Annulation…" onClick={annuler}>
            {libelles.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Effets d'une annulation sur le stock (« 150 kg de Maïs sortiront du stock. »). */
export function effetsStock(piece: PieceLue, verbe: string): string[] {
  return piece.lignes.map(
    (ligne) =>
      `${formaterQuantite(ligne.quantite_base, ligne.article.unite_base)} de ${nomComplet(ligne.article)} ${verbe}.`,
  );
}

export function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-texte-2">{libelle}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** Articles d'une pièce, avec la quantité saisie et sa conversion. */
export function ListeArticles({
  piece,
  sansPrix = false,
}: {
  piece: PieceLue;
  sansPrix?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label="Articles">
      <h3 className="font-semibold">Articles</h3>
      <ul className="flex flex-col divide-y divide-bordure">
        {piece.lignes.map((ligne) => (
          <li key={ligne.id} className="flex justify-between gap-4 py-2 tabular-nums">
            <span className="flex flex-col">
              <span>{nomComplet(ligne.article)}</span>
              <span className="text-xs text-texte-2">
                {formaterQuantite(ligne.quantite, ligne.unite)}
                {!sansPrix && ` à ${formaterMontant(ligne.prix_unitaire)}`}
                {ligne.unite !== ligne.article.unite_base &&
                  ` · ${formaterQuantite(ligne.quantite_base, ligne.article.unite_base)}`}
              </span>
            </span>
            {!sansPrix && <span>{formaterMontant(ligne.montant_total)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Total, payé, reste à payer. */
export function Totaux({
  piece,
  annule,
  libelleRegle,
}: {
  piece: PieceLue;
  annule: boolean;
  libelleRegle: string;
}) {
  return (
    <dl className="flex flex-col gap-2 rounded-md bg-fond-doux p-4 tabular-nums">
      <Ligne libelle="Total">
        <span className="font-semibold">{formaterMontant(piece.montant_total)}</span>
      </Ligne>
      <Ligne libelle={libelleRegle}>{formaterMontant(piece.montant_regle)}</Ligne>
      {!annule && !/^0+(\.0+)?$/.test(piece.reste_a_payer) && (
        <Ligne libelle="Reste à payer">
          <span className="font-medium text-attention">{formaterMontant(piece.reste_a_payer)}</span>
        </Ligne>
      )}
    </dl>
  );
}

/** Règlements d'une pièce ; ceux d'une pièce annulée sont barrés, « Contre-passé ». */
export function ListeReglements({ piece, titre }: { piece: PieceLue; titre: string }) {
  if (piece.reglements.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={titre}>
      <h3 className="font-semibold">{titre}</h3>
      <ul className="flex flex-col divide-y divide-bordure">
        {piece.reglements.map((r) => (
          <li key={r.id} className="flex justify-between gap-4 py-2 tabular-nums">
            <span className="flex flex-col">
              <span>
                {r.compte}
                {r.statut === "ANNULE" && (
                  <Badge variant="neutre" className="ml-2">
                    Contre-passé
                  </Badge>
                )}
              </span>
              <span className="text-xs text-texte-2">
                {formaterDate(r.date_reglement)} · {r.auteur}
                {r.reference_paiement && ` · réf. ${r.reference_paiement}`}
              </span>
            </span>
            <span className={r.statut === "ANNULE" ? "text-texte-2 line-through" : ""}>
              {formaterMontant(r.montant)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
