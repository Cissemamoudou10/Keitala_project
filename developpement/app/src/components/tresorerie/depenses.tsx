"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteFormulaire, SqueletteTableau } from "@/components/etats/squelettes";
import { ConfirmationMontant } from "@/components/pieces/confirmation-montant";
import { AnnulationPiece, Ligne } from "@/components/pieces/detail-piece";
import { dateDuJour, messageEchec } from "@/components/pieces/saisie";
import { ChampMontant } from "@/components/saisie/champ-montant";
import {
  ChoixCompte,
  FiltreCompte,
  FiltresDates,
  useComptes,
} from "@/components/tresorerie/filtres";
import { SousNavigationTresorerie } from "@/components/tresorerie/sous-navigation-tresorerie";
import {
  CLE_TRESORERIE,
  type Categorie,
  type Depense,
  type PageDepenses,
} from "@/components/tresorerie/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { ChampRecherche } from "@/components/ui/champ-recherche";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Panneau } from "@/components/ui/panneau";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi } from "@/lib/api";
import { estInferieur, soustraireDecimaux } from "@/lib/decimal";
import {
  formaterDate,
  formaterDateHeure,
  formaterMontant,
  formaterMontantSeul,
} from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";
import { SEUIL_CONFIRMATION_FCFA } from "@/lib/seuils";
import { cn } from "@/lib/utils";

const TOUTES = "toutes";

function useCategories() {
  return useQuery({
    queryKey: [...CLE_TRESORERIE, "categories"],
    queryFn: ({ signal }) => appelerApi<Categorie[]>("tresorerie/categories-depense", { signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Dépenses courantes catégorisées (US-TRES-02) : liste, saisie, annulation. */
export function Depenses() {
  const { lire, modifier, page } = useParametresAdresse();
  const peutSaisir = usePeut("saisir_tresorerie");
  const categories = useCategories();
  const categorie = lire("categorie");
  const compte = lire("compte");
  const du = lire("du");
  const au = lire("au");
  const recherche = lire("recherche");
  const depenseId = lire("depense") || null;
  const [creation, setCreation] = React.useState(false);

  const requete = useQuery({
    queryKey: [...CLE_TRESORERIE, "depenses", { categorie, compte, du, au, recherche, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageDepenses>("tresorerie/depenses", {
        parametres: {
          categorie_id: categorie || null,
          compte_id: compte || null,
          du: du || null,
          au: au || null,
          recherche,
          page,
        },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });
  const detail = useQuery({
    queryKey: [...CLE_TRESORERIE, "depenses", depenseId],
    queryFn: ({ signal }) => appelerApi<Depense>(`tresorerie/depenses/${depenseId}`, { signal }),
    enabled: depenseId !== null,
  });
  const filtre = categorie || compte || du || au || recherche;

  return (
    <Page
      titre="Trésorerie"
      description="Dépenses courantes, par catégorie."
      action={
        peutSaisir && (
          <Button variant="principal" onClick={() => setCreation(true)}>
            <Plus />
            Nouvelle dépense
          </Button>
        )
      }
    >
      <SousNavigationTresorerie />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <ChampRecherche
            libelle="Rechercher une dépense"
            placeholder="N°, désignation ou pièce"
            valeur={recherche}
            onChange={(texte) => modifier({ recherche: texte })}
          />
        </div>
        <Champ libelle="Catégorie">
          {(controle) => (
            <Select
              value={categorie || TOUTES}
              onValueChange={(valeur) => modifier({ categorie: valeur === TOUTES ? null : valeur })}
            >
              <SelectTrigger {...controle} className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOUTES}>Toutes les catégories</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Champ>
        <FiltreCompte valeur={compte} onChange={(valeur) => modifier({ compte: valeur })} />
        <FiltresDates du={du} au={au} onChange={modifier} />
      </div>

      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={8} colonnes={6} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={filtre ? "Aucune dépense pour ces critères." : "Aucune dépense enregistrée."}
            action={
              !filtre &&
              peutSaisir && (
                <Button onClick={() => setCreation(true)}>Saisir la première dépense</Button>
              )
            }
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
                  <TableHead>Désignation</TableHead>
                  <TableHead className="hidden md:table-cell">Catégorie</TableHead>
                  <TableHead className="hidden lg:table-cell">Compte</TableHead>
                  <TableHead numerique>Montant FCFA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((d) => {
                  const annulee = d.statut === "ANNULE";
                  return (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer"
                      onClick={() => modifier({ depense: d.id, page })}
                    >
                      <TableCell className="whitespace-nowrap text-texte-2">
                        {formaterDate(d.date_depense)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <button
                          type="button"
                          className={cn("text-left", annulee && "line-through")}
                          onClick={(evenement) => {
                            evenement.stopPropagation();
                            modifier({ depense: d.id, page });
                          }}
                        >
                          {d.numero}
                        </button>
                      </TableCell>
                      <TableCell>
                        {d.designation}
                        {annulee && (
                          <Badge variant="neutre" className="ml-2">
                            Annulé
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-texte-2 md:table-cell">
                        {d.categorie}
                      </TableCell>
                      <TableCell className="hidden text-texte-2 lg:table-cell">
                        {d.compte}
                      </TableCell>
                      <TableCell numerique className={cn(annulee && "text-texte-2")}>
                        {formaterMontantSeul(d.montant)}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
        titre="Nouvelle dépense"
        description="Le compte payeur est débité à l'enregistrement."
      >
        {creation && (
          <FormulaireDepense
            categories={categories.data ?? []}
            onTermine={(depense) => {
              setCreation(false);
              modifier({ depense: depense.id, page: 1 });
            }}
          />
        )}
      </Panneau>
      <Panneau
        ouvert={depenseId !== null}
        onOuvertChange={(ouvert) => !ouvert && modifier({ depense: null, page })}
        titre={detail.data ? `Dépense ${detail.data.numero}` : "Dépense"}
      >
        <EtatRequete requete={detail} chargement={<SqueletteFormulaire champs={5} />}>
          {(depense) => <DetailDepense depense={depense} />}
        </EtatRequete>
      </Panneau>
    </Page>
  );
}

type Erreurs = {
  categorie?: string;
  compte?: string;
  designation?: string;
  montant?: string;
  general?: string;
};

function FormulaireDepense({
  categories,
  onTermine,
}: {
  categories: Categorie[];
  onTermine: (depense: Depense) => void;
}) {
  const clientRequetes = useQueryClient();
  const comptes = useComptes();
  const actifs = (comptes.data ?? []).filter((c) => c.est_actif);
  // Clé d'idempotence (P-009) : la même tant que la dépense n'est pas enregistrée
  const [cle] = React.useState(() => crypto.randomUUID());
  const [categorieId, setCategorieId] = React.useState<number | null>(null);
  const [compteChoisi, setCompteChoisi] = React.useState<number | null>(null);
  const [designation, setDesignation] = React.useState("");
  const [montant, setMontant] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [piece, setPiece] = React.useState("");
  const [jour, setJour] = React.useState(dateDuJour());
  const [erreurs, setErreurs] = React.useState<Erreurs>({});
  const [enCours, setEnCours] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState(false);

  // La Caisse est proposée d'emblée : le cas le plus courant
  const compteId = compteChoisi ?? actifs.find((c) => c.type === "CAISSE")?.id ?? null;
  const compte = actifs.find((c) => c.id === compteId);
  const soldeApres = compte && montant ? soustraireDecimaux(compte.solde_actuel, montant) : null;

  const valider = (): Erreurs => {
    const nouvelles: Erreurs = {};
    if (categorieId === null) nouvelles.categorie = "Choisissez la catégorie.";
    if (!compte) nouvelles.compte = "Choisissez le compte qui paie.";
    if (designation.trim().length < 2) nouvelles.designation = "Décrivez la dépense.";
    if (!montant) nouvelles.montant = "Saisissez le montant.";
    else if (compte && compte.type !== "BANQUE" && estInferieur(compte.solde_actuel, montant)) {
      nouvelles.montant = `Il reste ${formaterMontant(compte.solde_actuel)} sur « ${compte.nom} ». Réduisez le montant ou choisissez un autre compte.`;
    }
    return nouvelles;
  };

  const demander = (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles = valider();
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;
    // Montant élevé relu en lettres : protège des « 20 millions au lieu de 2 »
    if (!estInferieur(montant, SEUIL_CONFIRMATION_FCFA)) setConfirmation(true);
    else void enregistrer();
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreurs({});
    try {
      const depense = await appelerApi<Depense>("tresorerie/depenses", {
        methode: "POST",
        corps: {
          cle_idempotence: cle,
          categorie_id: categorieId,
          compte_id: compteId,
          date_depense: jour || null,
          designation: designation.trim(),
          montant,
          reference_paiement: reference.trim() || null,
          piece_justificative: piece.trim() || null,
        },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_TRESORERIE });
      notifier.succes(`Dépense ${depense.numero} enregistrée`);
      onTermine(depense);
    } catch (cause) {
      setConfirmation(false);
      setErreurs({ general: messageEchec(cause, "la dépense ne sera pas enregistrée deux fois") });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={demander} noValidate className="flex flex-col gap-5">
      <Champ libelle="Catégorie" erreur={erreurs.categorie}>
        {(controle) => (
          <Select
            value={categorieId === null ? "" : String(categorieId)}
            onValueChange={(valeur) => setCategorieId(Number(valeur))}
          >
            <SelectTrigger {...controle}>
              <SelectValue placeholder="Choisir la catégorie" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Champ>
      <Champ libelle="Désignation" erreur={erreurs.designation}>
        {(controle) => (
          <Input
            {...controle}
            autoComplete="off"
            maxLength={255}
            placeholder="Ex. carburant moto pour la livraison"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
        )}
      </Champ>
      <Champ libelle="Montant" erreur={erreurs.montant}>
        {(controle) => (
          <ChampMontant {...controle} className="w-52" value={montant} onChange={setMontant} />
        )}
      </Champ>
      <ChoixCompte
        libelle="Payé par"
        comptes={actifs}
        valeur={compteId}
        onChange={setCompteChoisi}
        erreur={erreurs.compte}
        soldeApres={soldeApres}
      />
      {compte && compte.type !== "CAISSE" && (
        <Champ libelle="Référence du paiement" facultatif>
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
      <div className="flex flex-wrap gap-4">
        <Champ libelle="Pièce justificative" facultatif aide="N° du reçu ou de la facture.">
          {(controle) => (
            <Input
              {...controle}
              autoComplete="off"
              maxLength={100}
              className="w-56"
              value={piece}
              onChange={(e) => setPiece(e.target.value)}
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
          Enregistrer la dépense
        </Button>
      </div>
      <ConfirmationMontant
        ouvert={confirmation}
        onOuvertChange={setConfirmation}
        titre="Confirmer une dépense de"
        montant={montant}
        action="Enregistrer la dépense"
        enCours={enCours}
        onConfirmer={enregistrer}
      />
    </form>
  );
}

function DetailDepense({ depense }: { depense: Depense }) {
  const peutSaisir = usePeut("saisir_tresorerie");
  const clientRequetes = useQueryClient();
  const annulee = depense.statut === "ANNULE";

  return (
    <div className="flex flex-col gap-6">
      {annulee && (
        <p className="rounded-md bg-neutre-fond px-3 py-2 text-neutre">
          Annulée le {depense.annule_le ? formaterDateHeure(depense.annule_le) : ""} par{" "}
          {depense.annule_par} : {depense.motif_annulation}
        </p>
      )}
      <dl className="flex flex-col gap-2">
        <Ligne libelle="Montant">
          <span className="font-semibold tabular-nums">{formaterMontant(depense.montant)}</span>
        </Ligne>
        <Ligne libelle="Désignation">{depense.designation}</Ligne>
        <Ligne libelle="Catégorie">{depense.categorie}</Ligne>
        <Ligne libelle="Payé par">{depense.compte}</Ligne>
        {depense.reference_paiement && (
          <Ligne libelle="Référence">{depense.reference_paiement}</Ligne>
        )}
        {depense.piece_justificative && (
          <Ligne libelle="Pièce justificative">{depense.piece_justificative}</Ligne>
        )}
        <Ligne libelle="Date">{formaterDate(depense.date_depense)}</Ligne>
        <Ligne libelle="Saisie par">{depense.auteur}</Ligne>
        <Ligne libelle="Contrôle">
          {depense.controle_le
            ? `Contrôlée le ${formaterDate(depense.controle_le)} par ${depense.controle_par}`
            : "À contrôler"}
        </Ligne>
      </dl>
      {peutSaisir && !annulee && (
        <div>
          <AnnulationPiece
            piece={depense}
            adresse={`tresorerie/depenses/${depense.id}/annuler`}
            onEnregistre={async (resultat) => {
              clientRequetes.setQueryData([...CLE_TRESORERIE, "depenses", resultat.id], resultat);
              await clientRequetes.invalidateQueries({ queryKey: CLE_TRESORERIE });
            }}
            effets={[
              `Les ${formaterMontant(depense.montant)} reviendront sur « ${depense.compte} ».`,
            ]}
            libelles={{
              action: "Annuler la dépense",
              garder: "Garder la dépense",
              description: "La dépense restera dans la liste, marquée « Annulé ».",
              motifManquant: "Indiquez pourquoi la dépense est annulée.",
              annule: (numero) => `Dépense ${numero} annulée`,
            }}
          />
        </div>
      )}
    </div>
  );
}
