"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { ConfirmationMontant } from "@/components/pieces/confirmation-montant";
import { dateDuJour, messageEchec } from "@/components/pieces/saisie";
import { ChampMontant } from "@/components/saisie/champ-montant";
import {
  ChoixCompte,
  FiltreCompte,
  FiltresDates,
  useComptes,
} from "@/components/tresorerie/filtres";
import { SousNavigationTresorerie } from "@/components/tresorerie/sous-navigation-tresorerie";
import { CLE_TRESORERIE, type PageTransferts, type Transfert } from "@/components/tresorerie/types";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Panneau } from "@/components/ui/panneau";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi } from "@/lib/api";
import { additionnerDecimaux, estInferieur, soustraireDecimaux } from "@/lib/decimal";
import { formaterDate, formaterMontant, formaterMontantSeul } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";
import { SEUIL_CONFIRMATION_FCFA } from "@/lib/seuils";

/** Transferts entre comptes (US-TRES-03) : versement en banque, retrait, dépôt… */
export function Transferts() {
  const { lire, modifier, page } = useParametresAdresse();
  const peutSaisir = usePeut("saisir_tresorerie");
  const compte = lire("compte");
  const du = lire("du");
  const au = lire("au");
  const [creation, setCreation] = React.useState(false);

  const requete = useQuery({
    queryKey: [...CLE_TRESORERIE, "transferts", { compte, du, au, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageTransferts>("tresorerie/transferts", {
        parametres: { compte_id: compte || null, du: du || null, au: au || null, page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });

  return (
    <Page
      titre="Trésorerie"
      description="Argent déplacé d'un compte à l'autre, sans effet sur le résultat."
      action={
        peutSaisir && (
          <Button variant="principal" onClick={() => setCreation(true)}>
            <Plus />
            Nouveau transfert
          </Button>
        )
      }
    >
      <SousNavigationTresorerie />
      <div className="flex flex-wrap items-end gap-4">
        <FiltreCompte valeur={compte} onChange={(valeur) => modifier({ compte: valeur })} />
        <FiltresDates du={du} au={au} onChange={modifier} />
      </div>
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={6} colonnes={5} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={compte || du || au ? "Aucun transfert pour ces critères." : "Aucun transfert."}
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>N°</TableHead>
                  <TableHead>De → vers</TableHead>
                  <TableHead className="hidden lg:table-cell">Libellé</TableHead>
                  <TableHead numerique>Montant FCFA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-texte-2">
                      {formaterDate(t.date_transfert)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{t.numero}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1">
                        {t.compte_source}
                        <ArrowRight aria-label="vers" className="size-4 text-texte-2" />
                        {t.compte_destination}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-texte-2 lg:table-cell">
                      {t.libelle}
                      {t.reference_paiement && ` · réf. ${t.reference_paiement}`}
                    </TableCell>
                    <TableCell numerique>{formaterMontantSeul(t.montant)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={donnees.page}
              pagesTotal={donnees.pages_total}
              total={donnees.total}
              onPage={(numero) => modifier({ page: numero })}
            />
          </div>
        )}
      </EtatRequete>
      <Panneau
        ouvert={creation}
        onOuvertChange={setCreation}
        titre="Nouveau transfert"
        description="Le compte de départ est débité et celui d'arrivée crédité du même montant."
      >
        {creation && <FormulaireTransfert onTermine={() => setCreation(false)} />}
      </Panneau>
    </Page>
  );
}

type Erreurs = { source?: string; destination?: string; montant?: string; general?: string };

function FormulaireTransfert({ onTermine }: { onTermine: () => void }) {
  const clientRequetes = useQueryClient();
  const comptes = useComptes();
  const actifs = (comptes.data ?? []).filter((c) => c.est_actif);
  const [cle] = React.useState(() => crypto.randomUUID());
  const [sourceId, setSourceId] = React.useState<number | null>(null);
  const [destinationId, setDestinationId] = React.useState<number | null>(null);
  const [montant, setMontant] = React.useState("");
  const [libelle, setLibelle] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [jour, setJour] = React.useState(dateDuJour());
  const [erreurs, setErreurs] = React.useState<Erreurs>({});
  const [enCours, setEnCours] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState(false);

  const source = actifs.find((c) => c.id === sourceId);
  const destination = actifs.find((c) => c.id === destinationId);

  const demander = (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: Erreurs = {};
    if (!source) nouvelles.source = "Choisissez le compte d'où part l'argent.";
    if (!destination) nouvelles.destination = "Choisissez le compte qui reçoit l'argent.";
    else if (destination.id === source?.id) {
      nouvelles.destination = "Choisissez un compte différent du compte de départ.";
    }
    if (!montant) nouvelles.montant = "Saisissez le montant.";
    else if (source && source.type !== "BANQUE" && estInferieur(source.solde_actuel, montant)) {
      nouvelles.montant = `Il reste ${formaterMontant(source.solde_actuel)} sur « ${source.nom} ». Réduisez le montant.`;
    }
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;
    if (!estInferieur(montant, SEUIL_CONFIRMATION_FCFA)) setConfirmation(true);
    else void enregistrer();
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreurs({});
    try {
      const transfert = await appelerApi<Transfert>("tresorerie/transferts", {
        methode: "POST",
        corps: {
          cle_idempotence: cle,
          compte_source_id: sourceId,
          compte_destination_id: destinationId,
          montant,
          date_transfert: jour || null,
          libelle: libelle.trim() || null,
          reference_paiement: reference.trim() || null,
        },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_TRESORERIE });
      notifier.succes(`Transfert ${transfert.numero} enregistré`);
      onTermine();
    } catch (cause) {
      setConfirmation(false);
      setErreurs({ general: messageEchec(cause, "le transfert ne sera pas enregistré deux fois") });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={demander} noValidate className="flex flex-col gap-5">
      <ChoixCompte
        libelle="De"
        comptes={actifs}
        valeur={sourceId}
        onChange={setSourceId}
        erreur={erreurs.source}
        soldeApres={source && montant ? soustraireDecimaux(source.solde_actuel, montant) : null}
      />
      <ChoixCompte
        libelle="Vers"
        comptes={actifs.filter((c) => c.id !== sourceId)}
        valeur={destinationId}
        onChange={setDestinationId}
        erreur={erreurs.destination}
        soldeApres={
          destination && montant ? additionnerDecimaux([destination.solde_actuel, montant]) : null
        }
      />
      <Champ libelle="Montant" erreur={erreurs.montant}>
        {(controle) => (
          <ChampMontant {...controle} className="w-52" value={montant} onChange={setMontant} />
        )}
      </Champ>
      <Champ libelle="Libellé" facultatif>
        {(controle) => (
          <Input
            {...controle}
            autoComplete="off"
            maxLength={255}
            placeholder="Ex. versement des recettes de la semaine"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
          />
        )}
      </Champ>
      <div className="flex flex-wrap gap-4">
        <Champ libelle="Référence" facultatif aide="N° de bordereau ou de transaction.">
          {(controle) => (
            <Input
              {...controle}
              autoComplete="off"
              maxLength={100}
              className="w-56"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </Champ>
        <Champ libelle="Date">
          {(controle) => (
            <Input
              {...controle}
              type="date"
              max={dateDuJour()}
              className="w-44"
              value={jour}
              onChange={(e) => setJour(e.target.value)}
            />
          )}
        </Champ>
      </div>
      {erreurs.general && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreurs.general}
        </p>
      )}
      <div>
        <Button type="submit" variant="principal" enCours={enCours}>
          Enregistrer le transfert
        </Button>
      </div>
      <ConfirmationMontant
        ouvert={confirmation}
        onOuvertChange={setConfirmation}
        titre="Confirmer un transfert de"
        montant={montant}
        action="Enregistrer le transfert"
        enCours={enCours}
        onConfirmer={enregistrer}
      />
    </form>
  );
}
