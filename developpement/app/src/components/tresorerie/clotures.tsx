"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteFormulaire, SqueletteTableau } from "@/components/etats/squelettes";
import { dateDuJour, messageEchec } from "@/components/pieces/saisie";
import { ChampMontant } from "@/components/saisie/champ-montant";
import {
  ChoixCompte,
  FiltreCompte,
  FiltresDates,
  useComptes,
} from "@/components/tresorerie/filtres";
import { Billetage, totalBilletage, type Nombres } from "@/components/tresorerie/billetage";
import { SousNavigationTresorerie } from "@/components/tresorerie/sous-navigation-tresorerie";
import {
  CLE_TRESORERIE,
  type Cloture,
  type PageClotures,
  type PreparationCloture,
} from "@/components/tresorerie/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaseACocher } from "@/components/ui/case-a-cocher";
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
import { soustraireDecimaux } from "@/lib/decimal";
import { formaterDate, formaterMontant, formaterMontantSeul } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";
import { cn } from "@/lib/utils";

const NUL = /^-?0+(\.0+)?$/;

/** « +500 » excédent, « −500 » manquant, null sans écart. */
function sensEcart(ecart: string): "excedent" | "manquant" | null {
  if (NUL.test(ecart)) return null;
  return ecart.startsWith("-") ? "manquant" : "excedent";
}

function EtiquetteEcart({ ecart }: { ecart: string }) {
  const sens = sensEcart(ecart);
  if (sens === null) return <Badge variant="succes">Sans écart</Badge>;
  const montant = formaterMontant(ecart.replace("-", ""));
  return (
    <Badge variant={sens === "manquant" ? "danger" : "attention"}>
      {sens === "manquant" ? `Manquant ${montant}` : `Excédent ${montant}`}
    </Badge>
  );
}

/** Clôture journalière des comptes (US-TRES-04) : liste et billetage du jour. */
export function Clotures() {
  const { lire, modifier, page } = useParametresAdresse();
  const peutSaisir = usePeut("saisir_tresorerie");
  const compte = lire("compte");
  const du = lire("du");
  const au = lire("au");
  const [creation, setCreation] = React.useState(false);

  const requete = useQuery({
    queryKey: [...CLE_TRESORERIE, "clotures", { compte, du, au, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageClotures>("tresorerie/clotures", {
        parametres: { compte_id: compte || null, du: du || null, au: au || null, page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });

  return (
    <Page
      titre="Trésorerie"
      description="Clôture du jour : ce qui est compté comparé à ce que dit le journal."
      action={
        peutSaisir && (
          <Button variant="principal" onClick={() => setCreation(true)}>
            <Plus />
            Clôturer la journée
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
        chargement={<SqueletteTableau lignes={6} colonnes={6} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={compte || du || au ? "Aucune clôture pour ces critères." : "Aucune clôture."}
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Compte</TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Théorique FCFA
                  </TableHead>
                  <TableHead numerique>Compté FCFA</TableHead>
                  <TableHead>Écart</TableHead>
                  <TableHead className="hidden lg:table-cell">Commentaire</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap text-texte-2">
                      {formaterDate(c.date_cloture)}
                    </TableCell>
                    <TableCell>{c.compte}</TableCell>
                    <TableCell numerique className="hidden md:table-cell">
                      {formaterMontantSeul(c.solde_theorique)}
                    </TableCell>
                    <TableCell numerique>{formaterMontantSeul(c.solde_physique)}</TableCell>
                    <TableCell>
                      <EtiquetteEcart ecart={c.ecart} />
                    </TableCell>
                    <TableCell className="hidden text-texte-2 lg:table-cell">
                      {c.commentaire}
                    </TableCell>
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
        titre="Clôturer la journée"
        description="Comptez l'argent réellement présent, puis comparez."
      >
        {creation && <FormulaireCloture onTermine={() => setCreation(false)} />}
      </Panneau>
    </Page>
  );
}

function Ligne({ libelle, montant, fort }: { libelle: string; montant: string; fort?: boolean }) {
  return (
    <p className={cn("flex justify-between tabular-nums", fort && "font-semibold")}>
      <span className={fort ? undefined : "text-texte-2"}>{libelle}</span>
      <span>{formaterMontant(montant)}</span>
    </p>
  );
}

function FormulaireCloture({ onTermine }: { onTermine: () => void }) {
  const clientRequetes = useQueryClient();
  const comptes = useComptes();
  const actifs = (comptes.data ?? []).filter((c) => c.est_actif);
  const [compteChoisi, setCompteChoisi] = React.useState<number | null>(null);
  const [jour, setJour] = React.useState(dateDuJour());
  const [physique, setPhysique] = React.useState("");
  const [parCoupures, setParCoupures] = React.useState(false);
  const [nombres, setNombres] = React.useState<Nombres>({});
  const [commentaire, setCommentaire] = React.useState("");
  const [erreurs, setErreurs] = React.useState<{
    physique?: string;
    commentaire?: string;
    general?: string;
  }>({});
  const [enCours, setEnCours] = React.useState(false);

  // La Caisse est proposée d'emblée ; la clôture sert aussi au rapprochement Mobile Money
  const compteId = compteChoisi ?? actifs.find((c) => c.type === "CAISSE")?.id ?? null;
  const preparation = useQuery({
    queryKey: [...CLE_TRESORERIE, "clotures", "preparation", compteId, jour],
    queryFn: ({ signal }) =>
      appelerApi<PreparationCloture>("tresorerie/clotures/preparation", {
        parametres: { compte_id: compteId, date_cloture: jour || null },
        signal,
      }),
    enabled: compteId !== null && jour !== "",
  });
  const recap = preparation.data;
  const compte = actifs.find((c) => c.id === compteId);
  // Billetage : seulement pour des espèces ; le montant compté s'en déduit
  const billetage = parCoupures && compte?.type === "CAISSE";
  const montantCompte = billetage ? totalBilletage(nombres) : physique;
  const ecart =
    recap && montantCompte ? soustraireDecimaux(montantCompte, recap.solde_theorique) : null;
  const sens = ecart === null ? null : sensEcart(ecart);

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    if (!recap || recap.deja_cloturee) return;
    const nouvelles: typeof erreurs = {};
    if (!montantCompte)
      nouvelles.physique = "Saisissez le montant compté (0 si le compte est vide).";
    if (sens !== null && commentaire.trim().length === 0) {
      nouvelles.commentaire = "Expliquez l'écart : erreur de monnaie, dépense oubliée…";
    }
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;

    setEnCours(true);
    try {
      await appelerApi<Cloture>("tresorerie/clotures", {
        methode: "POST",
        corps: {
          compte_id: compteId,
          date_cloture: jour,
          solde_physique: montantCompte,
          commentaire: commentaire.trim() || null,
        },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_TRESORERIE });
      notifier.succes(`« ${recap.compte} » clôturé pour le ${formaterDate(jour)}`);
      onTermine();
    } catch (cause) {
      setErreurs({ general: messageEchec(cause, "la clôture ne sera pas faite deux fois") });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={envoyer} noValidate className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-4">
        <ChoixCompte
          libelle="Compte"
          comptes={actifs}
          valeur={compteId}
          onChange={(id) => {
            setCompteChoisi(id);
            setPhysique("");
            setNombres({});
          }}
        />
        <Champ libelle="Journée">
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

      <EtatRequete requete={preparation} chargement={<SqueletteFormulaire champs={3} />}>
        {(donnees) =>
          donnees.deja_cloturee ? (
            <p className="rounded-md bg-info-fond px-3 py-2 text-info">
              « {donnees.compte} » est déjà clôturé pour le {formaterDate(donnees.date_cloture)}.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <section
                aria-label="Récapitulatif du jour"
                className="flex flex-col gap-2 rounded-md bg-fond-doux p-4"
              >
                <Ligne libelle="Solde d'ouverture" montant={donnees.solde_ouverture} />
                <Ligne libelle="+ Entrées du jour" montant={donnees.total_entrees} />
                <Ligne libelle="− Sorties du jour" montant={donnees.total_sorties} />
                <Ligne libelle="= Solde théorique" montant={donnees.solde_theorique} fort />
              </section>
              {compte?.type === "CAISSE" && (
                <CaseACocher
                  libelle="Compter par billets et pièces"
                  checked={parCoupures}
                  onChange={(e) => setParCoupures(e.target.checked)}
                />
              )}
              {billetage && <Billetage nombres={nombres} onChange={setNombres} />}
              <Champ
                libelle="Montant compté"
                erreur={erreurs.physique}
                aide={billetage ? "Total des billets et pièces." : undefined}
              >
                {(controle) => (
                  <ChampMontant
                    {...controle}
                    autoFocus={!billetage}
                    readOnly={billetage}
                    className="w-52"
                    value={billetage ? (montantCompte === "0" ? "" : montantCompte) : physique}
                    onChange={setPhysique}
                  />
                )}
              </Champ>
              {ecart !== null && (
                <p
                  aria-live="polite"
                  className={cn(
                    "rounded-md px-3 py-2",
                    sens === null && "bg-succes-fond text-succes",
                    sens === "excedent" && "bg-attention-fond text-attention",
                    sens === "manquant" && "bg-danger-fond text-danger",
                  )}
                >
                  {sens === null
                    ? "Aucun écart : le compté correspond au journal."
                    : `${sens === "manquant" ? "Manquant" : "Excédent"} de ${formaterMontant(ecart.replace("-", ""))}. Le solde du compte sera ajusté au montant compté.`}
                </p>
              )}
              <Champ libelle="Commentaire" facultatif={sens === null} erreur={erreurs.commentaire}>
                {(controle) => (
                  <Input
                    {...controle}
                    autoComplete="off"
                    maxLength={1000}
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                  />
                )}
              </Champ>
            </div>
          )
        }
      </EtatRequete>

      {erreurs.general && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreurs.general}
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="principal"
          enCours={enCours}
          disabled={!recap || recap.deja_cloturee}
        >
          Clôturer
        </Button>
      </div>
    </form>
  );
}
