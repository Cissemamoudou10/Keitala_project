"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CLE_ARTICLES, nomComplet } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { BlocPaiements, Recapitulatif, validerPaiements } from "@/components/pieces/bloc-paiements";
import { ConfirmationMontant } from "@/components/pieces/confirmation-montant";
import { LignesArticles } from "@/components/pieces/lignes-articles";
import {
  dateDuJour,
  ecrireBrouillon,
  lireBrouillon,
  messageEchec,
  nouveauPaiement,
  nouvelleLigne,
  paiementsAffiches,
  quantiteValide,
  totalDesLignes,
  totalRegle,
  useAvertirAvantDeQuitter,
  type ErreursLigne,
  type ErreursPaiement,
  type Ligne,
  type Paiement,
} from "@/components/pieces/saisie";
import { quantiteEnBase } from "@/components/saisie/champ-quantite";
import type { Tiers } from "@/components/tiers/formulaire-tiers";
import { CLE_COMPTES, type CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
import { Button } from "@/components/ui/button";
import { CaseACocher } from "@/components/ui/case-a-cocher";
import { Champ } from "@/components/ui/champ";
import { ChampChoix } from "@/components/ui/champ-choix";
import { Input } from "@/components/ui/input";
import { CLE_VENTES, CLIENT_COMPTOIR, type VenteDetail } from "@/components/ventes/types";
import { appelerApi } from "@/lib/api";
import { additionnerDecimaux, estInferieur, soustraireDecimaux } from "@/lib/decimal";
import { formaterMontant, formaterQuantite } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { SEUIL_CONFIRMATION_FCFA } from "@/lib/seuils";

type Client = Pick<Tiers, "id" | "nom" | "telephone">;

/** Tout ce qui est saisi, gardé en brouillon dans le navigateur. */
export type SaisieVente = {
  /** Clé d'idempotence (P-009) : la même tant que la pièce n'est pas enregistrée. */
  cleIdempotence: string;
  /** Don, échantillon ou dégustation (US-VTE-04) : ni prix, ni client, ni règlement. */
  estDon: boolean;
  client: Client | null;
  /** Nom d'un client de passage ; vide = client comptoir. */
  clientLibre: string;
  dateVente: string;
  beneficiaire: string;
  motifDon: string;
  lignes: Ligne[];
  paiements: Paiement[];
  /** Le premier paiement suit le total tant que l'utilisateur n'y a pas touché. */
  paiementSuitTotal: boolean;
};

type Erreurs = {
  client?: string;
  beneficiaire?: string;
  motifDon?: string;
  lignes?: Record<string, ErreursLigne>;
  paiements?: Record<string, ErreursPaiement>;
  general?: string;
};

const CLE_BROUILLON = "keitala:brouillon-vente";

export const lireBrouillonVente = () => lireBrouillon<SaisieVente>(CLE_BROUILLON);

function nouvelleSaisie(): SaisieVente {
  return {
    cleIdempotence: crypto.randomUUID(),
    estDon: false,
    client: null,
    clientLibre: "",
    dateVente: dateDuJour(),
    beneficiaire: "",
    motifDon: "",
    lignes: [nouvelleLigne()],
    paiements: [nouveauPaiement()],
    paiementSuitTotal: true,
  };
}

function estModifiee(saisie: SaisieVente): boolean {
  return (
    saisie.client !== null ||
    saisie.clientLibre.trim() !== "" ||
    saisie.beneficiaire.trim() !== "" ||
    saisie.lignes.some((l) => l.article || l.quantite)
  );
}

async function chercherClients(texte: string, signal: AbortSignal): Promise<Client[]> {
  const page = await appelerApi<{ items: Tiers[] }>("tiers", {
    parametres: { type: "client", recherche: texte, taille: 20 },
    signal,
  });
  return page.items;
}

/**
 * Stock insuffisant, toutes les lignes d'un même article additionnées (US-VTE-01,
 * règle 2) : l'erreur se place sur la dernière ligne de l'article.
 */
function erreursDeStock(lignes: Ligne[]): Record<string, string> {
  const demandes = new Map<string, { total: string; derniere: string; ligne: Ligne }>();
  for (const ligne of lignes) {
    const article = ligne.article;
    if (!article || article.autoriser_stock_negatif) continue;
    const base = quantiteEnBase(ligne.quantite, ligne.uniteId, article.unites);
    if (base === null) continue;
    const avant = demandes.get(article.id);
    demandes.set(article.id, {
      total: additionnerDecimaux([avant?.total ?? "0", base]) ?? base,
      derniere: ligne.cle,
      ligne,
    });
  }
  const erreurs: Record<string, string> = {};
  for (const { total, derniere, ligne } of demandes.values()) {
    const article = ligne.article!;
    if (estInferieur(article.stock_actuel, total) === true) {
      erreurs[derniere] =
        `Il reste ${formaterQuantite(article.stock_actuel, article.unite_base)} de ${nomComplet(article)}. Réduisez la quantité.`;
    }
  }
  return erreurs;
}

/**
 * Point de vente (US-VTE-01, 02, 04) : client ou client comptoir, articles en kg ou en
 * sacs avec le prix catalogue proposé, encaissement sur un ou plusieurs comptes. Le
 * reste non encaissé devient une créance du client. Case « Don / échantillon ».
 */
export function FormulaireVente({ brouillon }: { brouillon: SaisieVente | null }) {
  const router = useRouter();
  const clientRequetes = useQueryClient();
  const [saisie, setSaisie] = React.useState<SaisieVente>(() => brouillon ?? nouvelleSaisie());
  const [repris, setRepris] = React.useState(brouillon !== null);
  const [erreurs, setErreurs] = React.useState<Erreurs>({});
  const [enCours, setEnCours] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState(false);
  const formulaire = React.useRef<HTMLFormElement>(null);

  const comptes = useQuery({
    queryKey: CLE_COMPTES,
    queryFn: ({ signal }) => appelerApi<CompteTresorerie[]>("tresorerie/comptes", { signal }),
  });
  const comptesActifs = (comptes.data ?? []).filter((c) => c.est_actif);

  const total = saisie.estDon ? "0" : totalDesLignes(saisie.lignes);
  const paiements = saisie.estDon
    ? []
    : paiementsAffiches(saisie.paiements, saisie.paiementSuitTotal, total, comptesActifs);
  const regle = totalRegle(paiements);
  const reste = soustraireDecimaux(total, regle) ?? "0";
  const aCredit = !reste.startsWith("-") && !/^0+(\.0+)?$/.test(reste);
  const nomClient = saisie.client?.nom ?? (saisie.clientLibre.trim() || null);

  // Brouillon gardé à chaque frappe : un réseau coupé ou un onglet fermé ne perd rien
  React.useEffect(() => {
    ecrireBrouillon(CLE_BROUILLON, estModifiee(saisie) ? saisie : null);
  }, [saisie]);
  useAvertirAvantDeQuitter(estModifiee(saisie));

  const modifier = (changement: Partial<SaisieVente>) => {
    setSaisie((avant) => ({ ...avant, ...changement }));
    setRepris(false);
  };

  const recommencer = () => {
    ecrireBrouillon(CLE_BROUILLON, null);
    setSaisie(nouvelleSaisie());
    setErreurs({});
    setRepris(false);
  };

  const valider = (): Erreurs => {
    const nouvelles: Erreurs = {};
    const stock = erreursDeStock(saisie.lignes);
    const lignes: Record<string, ErreursLigne> = {};
    for (const ligne of saisie.lignes) {
      const e: ErreursLigne = {};
      if (!ligne.article) e.article = "Choisissez l'article.";
      if (!quantiteValide(ligne.quantite)) {
        e.quantite = saisie.estDon
          ? "Saisissez la quantité donnée."
          : "Saisissez la quantité vendue.";
      } else if (stock[ligne.cle]) e.quantite = stock[ligne.cle];
      if (!saisie.estDon && ligne.prix === "") e.prix = "Saisissez le prix de vente.";
      if (Object.keys(e).length > 0) lignes[ligne.cle] = e;
    }
    if (Object.keys(lignes).length > 0) nouvelles.lignes = lignes;

    if (saisie.estDon) {
      if (!saisie.beneficiaire.trim()) nouvelles.beneficiaire = "Indiquez qui reçoit le don.";
      if (saisie.motifDon.trim().length < 3) {
        nouvelles.motifDon = "Indiquez le motif : dégustation, don, promotion…";
      }
      return nouvelles;
    }
    const erreursPaiements = validerPaiements(paiements, comptesActifs, "encaissement");
    if (Object.keys(erreursPaiements).length > 0) nouvelles.paiements = erreursPaiements;
    if (reste.startsWith("-")) {
      nouvelles.general = `Les encaissements dépassent le total de ${formaterMontant(soustraireDecimaux("0", reste) ?? "0")}.`;
    }
    if (aCredit && !saisie.client) {
      nouvelles.client = saisie.clientLibre.trim()
        ? "Une vente à crédit exige un client du répertoire : choisissez-le dans la liste."
        : "Choisissez le client : le reste à payer deviendra une créance sur lui.";
    }
    return nouvelles;
  };

  const demanderEnregistrement = () => {
    if (enCours) return;
    const nouvelles = valider();
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) {
      // Amène la première erreur à l'écran
      window.requestAnimationFrame(() =>
        formulaire.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
      );
      return;
    }
    if (!saisie.estDon && !estInferieur(total, SEUIL_CONFIRMATION_FCFA)) setConfirmation(true);
    else void enregistrer();
  };

  const corps = () => {
    const lignes = saisie.lignes.map((l) => ({
      article_id: l.article?.id,
      unite_id: l.uniteId,
      quantite: l.quantite.replace(",", "."),
      ...(saisie.estDon ? {} : { prix_unitaire: l.prix }),
    }));
    if (saisie.estDon) {
      return {
        cle_idempotence: saisie.cleIdempotence,
        beneficiaire: saisie.beneficiaire.trim(),
        motif: saisie.motifDon.trim(),
        date_vente: saisie.dateVente || null,
        lignes,
      };
    }
    return {
      cle_idempotence: saisie.cleIdempotence,
      client_id: saisie.client?.id ?? null,
      client_nom_libre: saisie.client ? null : saisie.clientLibre.trim() || null,
      date_vente: saisie.dateVente || null,
      lignes,
      reglements: paiements.map((p) => ({
        compte_id: p.compteId,
        montant: p.montant,
        reference_paiement: p.reference.trim() || null,
      })),
    };
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreurs({});
    try {
      const piece = await appelerApi<VenteDetail>(saisie.estDon ? "ventes/dons" : "ventes", {
        methode: "POST",
        corps: corps(),
      });
      ecrireBrouillon(CLE_BROUILLON, null);
      setSaisie(nouvelleSaisie());
      await Promise.all(
        [CLE_VENTES, CLE_ARTICLES, CLE_COMPTES, ["tiers"], ["stocks"]].map((queryKey) =>
          clientRequetes.invalidateQueries({ queryKey }),
        ),
      );
      notifier.succes(
        piece.est_don ? `Don ${piece.numero} enregistré` : `Vente ${piece.numero} enregistrée`,
      );
      router.push(`/ventes?vente=${piece.id}`);
    } catch (cause) {
      setConfirmation(false);
      setErreurs({
        general: messageEchec(
          cause,
          saisie.estDon
            ? "le don ne sera pas enregistré deux fois"
            : "la vente ne sera pas enregistrée deux fois",
        ),
      });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Page
      titre={saisie.estDon ? "Nouveau don" : "Nouvelle vente"}
      description={
        saisie.estDon
          ? "Don, échantillon ou dégustation : le stock sort, sans montant à encaisser."
          : "Le stock et les comptes sont mis à jour à l'enregistrement."
      }
      largeur="formulaire"
    >
      {repris && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-info-fond px-3 py-2 text-info">
          Votre saisie précédente a été reprise.
          <Button variant="discret" onClick={recommencer}>
            Recommencer à zéro
          </Button>
        </p>
      )}
      <form
        ref={formulaire}
        noValidate
        onKeyDown={(evenement) => {
          if (evenement.key === "Enter" && (evenement.ctrlKey || evenement.metaKey)) {
            evenement.preventDefault();
            demanderEnregistrement();
          }
        }}
        onSubmit={(evenement) => {
          evenement.preventDefault();
          demanderEnregistrement();
        }}
        className="flex flex-col gap-8"
      >
        <section className="flex flex-col gap-5">
          <CaseACocher
            libelle="Don / échantillon"
            aide="Dégustation, don ou promotion : rien à encaisser."
            checked={saisie.estDon}
            onChange={(e) => {
              modifier({ estDon: e.target.checked });
              setErreurs({});
            }}
          />
          {saisie.estDon ? (
            <div className="flex flex-col gap-5">
              <Champ libelle="Bénéficiaire" erreur={erreurs.beneficiaire}>
                {(controle) => (
                  <Input
                    {...controle}
                    autoComplete="off"
                    maxLength={150}
                    placeholder="Ex. École de Kati, salon de Bamako"
                    value={saisie.beneficiaire}
                    onChange={(e) => modifier({ beneficiaire: e.target.value })}
                  />
                )}
              </Champ>
              <Champ libelle="Motif" erreur={erreurs.motifDon}>
                {(controle) => (
                  <Input
                    {...controle}
                    autoComplete="off"
                    maxLength={255}
                    placeholder="Ex. dégustation"
                    value={saisie.motifDon}
                    onChange={(e) => modifier({ motifDon: e.target.value })}
                  />
                )}
              </Champ>
            </div>
          ) : (
            <Champ
              libelle="Client"
              facultatif
              erreur={erreurs.client}
              aide={
                saisie.client
                  ? undefined
                  : saisie.clientLibre.trim()
                    ? "Client de passage : le nom sera seulement noté sur la facture (paiement comptant)."
                    : `Laissez vide pour un ${CLIENT_COMPTOIR.toLowerCase()}.`
              }
            >
              {(controle) => (
                // Clé de la saisie : le champ repart à vide quand on recommence
                <ChampChoix<Client>
                  key={saisie.cleIdempotence}
                  {...controle}
                  autoFocus={!repris}
                  valeur={saisie.client}
                  texteInitial={saisie.clientLibre}
                  onChoix={(client) => modifier({ client })}
                  onTexteChange={(clientLibre) => modifier({ clientLibre })}
                  libelleDe={(c) => c.nom}
                  cleDe={(c) => c.id}
                  rechercher={chercherClients}
                  cleRequete={["tiers", "clients"]}
                  placeholder={CLIENT_COMPTOIR}
                />
              )}
            </Champ>
          )}
          <Champ libelle="Date">
            {(controle) => (
              <Input
                {...controle}
                type="date"
                max={dateDuJour()}
                className="w-44"
                value={saisie.dateVente}
                onChange={(e) => modifier({ dateVente: e.target.value })}
              />
            )}
          </Champ>
        </section>

        <LignesArticles
          titre={saisie.estDon ? "Articles donnés" : "Articles vendus"}
          lignes={saisie.lignes}
          erreurs={erreurs.lignes}
          onChange={(lignes) => modifier({ lignes })}
          sortie
          sansPrix={saisie.estDon}
        />

        {!saisie.estDon && (
          <>
            <BlocPaiements
              flux="encaissement"
              paiements={paiements}
              comptes={comptesActifs}
              total={total}
              erreurs={erreurs.paiements}
              onChange={(suivants, manuel) =>
                modifier({
                  paiements: suivants,
                  paiementSuitTotal: saisie.paiementSuitTotal && !manuel,
                })
              }
            />
            <Recapitulatif
              libelleTotal="Total de la vente"
              total={total}
              libelleRegle="Encaissé maintenant"
              regle={regle}
              libelleReste={`Reste dû${nomClient ? ` par ${nomClient}` : ""}`}
              reste={reste}
            />
          </>
        )}

        {erreurs.general && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreurs.general}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            variant="principal"
            enCours={enCours}
            libelleEnCours="Enregistrement…"
          >
            {saisie.estDon ? "Enregistrer le don" : "Enregistrer la vente"}
          </Button>
          <Button asChild variant="discret">
            <Link href="/ventes">Retour aux ventes</Link>
          </Button>
          <span className="hidden text-xs text-texte-2 lg:inline">
            Ctrl + Entrée pour enregistrer
          </span>
        </div>
      </form>

      <ConfirmationMontant
        ouvert={confirmation}
        onOuvertChange={setConfirmation}
        titre="Confirmer une vente de"
        montant={total}
        action="Enregistrer la vente"
        enCours={enCours}
        onConfirmer={enregistrer}
      />
    </Page>
  );
}
