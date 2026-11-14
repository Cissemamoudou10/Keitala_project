"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CLE_ACHATS, estNul, etatPaiement, type AchatDetail } from "@/components/achats/types";
import { CLE_ARTICLES, nomComplet } from "@/components/articles/types";
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
import { estInferieur, soustraireDecimaux } from "@/lib/decimal";
import { formaterDate, formaterDateHeure, formaterMontant, formaterQuantite } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { usePeut } from "@/lib/session";

function useRafraichirApresAchat() {
  const clientRequetes = useQueryClient();
  return async (achat: AchatDetail) => {
    clientRequetes.setQueryData([...CLE_ACHATS, achat.id], achat);
    await Promise.all([
      clientRequetes.invalidateQueries({ queryKey: CLE_ACHATS }),
      clientRequetes.invalidateQueries({ queryKey: CLE_COMPTES }),
      clientRequetes.invalidateQueries({ queryKey: CLE_ARTICLES }),
      clientRequetes.invalidateQueries({ queryKey: ["tiers"] }),
      clientRequetes.invalidateQueries({ queryKey: ["stocks"] }),
    ]);
  };
}

function messageDe(cause: unknown): string {
  if (!(cause instanceof ErreurApi)) return "Une erreur inattendue est survenue.";
  return cause.statut === 0
    ? "La connexion a été perdue. Réessayez : le paiement ne sera pas enregistré deux fois."
    : cause.message;
}

/** Paiement d'une dette fournisseur (US-ACH-03) : pré-rempli avec le reste à payer. */
function FormulairePaiement({ achat }: { achat: AchatDetail }) {
  const rafraichir = useRafraichirApresAchat();
  const comptes = useQuery({
    queryKey: CLE_COMPTES,
    queryFn: ({ signal }) => appelerApi<CompteTresorerie[]>("tresorerie/comptes", { signal }),
  });
  const actifs = (comptes.data ?? []).filter((c) => c.est_actif);
  // Paiements en FCFA entiers
  const resteEntier = achat.reste_a_payer.split(".")[0];
  const [cle] = React.useState(() => crypto.randomUUID());
  const [compteId, setCompteId] = React.useState<number | null>(null);
  const [montant, setMontant] = React.useState(resteEntier);
  const [reference, setReference] = React.useState("");
  const [erreurs, setErreurs] = React.useState<{ compte?: string; montant?: string }>({});
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const compte = actifs.find((c) => c.id === compteId);
  const soldeApres = compte && montant ? soustraireDecimaux(compte.solde_actuel, montant) : null;

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: typeof erreurs = {};
    if (!compte) nouvelles.compte = "Choisissez le compte qui paie.";
    if (!montant) nouvelles.montant = "Saisissez le montant payé.";
    else if (estInferieur(achat.reste_a_payer, montant)) {
      nouvelles.montant = `Le reste à payer est de ${formaterMontant(achat.reste_a_payer)}. Réduisez le montant.`;
    } else if (compte && compte.type !== "BANQUE" && estInferieur(compte.solde_actuel, montant)) {
      nouvelles.montant = `Il reste ${formaterMontant(compte.solde_actuel)} sur « ${compte.nom} ». Réduisez le montant ou choisissez un autre compte.`;
    }
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;

    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await appelerApi<AchatDetail>(`achats/${achat.id}/reglements`, {
        methode: "POST",
        corps: {
          cle_idempotence: cle,
          compte_id: compteId,
          montant,
          reference_paiement: reference.trim() || null,
        },
      });
      await rafraichir(resultat);
      notifier.succes(
        estNul(resultat.reste_a_payer)
          ? `Achat ${resultat.numero} soldé`
          : `Paiement de ${formaterMontant(montant)} enregistré ; reste ${formaterMontant(resultat.reste_a_payer)}`,
      );
    } catch (cause) {
      setErreur(messageDe(cause));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      onSubmit={envoyer}
      noValidate
      className="flex flex-col gap-4 rounded-md border border-bordure p-4"
      aria-label="Payer le fournisseur"
    >
      <h3 className="font-semibold">Payer le fournisseur</h3>
      <div className="flex flex-wrap items-start gap-4">
        <Champ
          libelle="Compte"
          erreur={erreurs.compte}
          aide={
            compte
              ? `Solde ${soldeApres !== null ? "après" : ""} : ${formaterMontant(soldeApres ?? compte.solde_actuel)}`
              : undefined
          }
        >
          {(controle) => (
            <Select
              value={compteId === null ? "" : String(compteId)}
              onValueChange={(valeur) => setCompteId(Number(valeur))}
            >
              <SelectTrigger {...controle} className="w-52">
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
          Enregistrer le paiement
        </Button>
      </div>
    </form>
  );
}

/** Annulation (US-ACH-04) : rappelle les effets et exige un motif (charte, section 10). */
function AnnulationAchat({ achat }: { achat: AchatDetail }) {
  const rafraichir = useRafraichirApresAchat();
  const [ouvert, setOuvert] = React.useState(false);
  const [motif, setMotif] = React.useState("");
  const [erreurMotif, setErreurMotif] = React.useState<string | undefined>();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);
  const paiements = achat.reglements.filter((r) => r.statut === "VALIDE");

  const annuler = async () => {
    if (motif.trim().length < 3) {
      setErreurMotif("Indiquez pourquoi l'achat est annulé.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await appelerApi<AchatDetail>(`achats/${achat.id}/annuler`, {
        methode: "POST",
        corps: { motif: motif.trim() },
      });
      await rafraichir(resultat);
      notifier.succes(`Achat ${resultat.numero} annulé`);
      setOuvert(false);
    } catch (cause) {
      setErreur(messageDe(cause));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialog open={ouvert} onOpenChange={(valeur) => !enCours && setOuvert(valeur)}>
      <DialogTrigger asChild>
        <Button variant="discret">Annuler l&apos;achat</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler l&apos;achat {achat.numero}</DialogTitle>
          <DialogDescription>
            L&apos;achat restera dans l&apos;historique, marqué « Annulé ».
          </DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-texte-2">
          {achat.lignes.map((ligne) => (
            <li key={ligne.id}>
              {formaterQuantite(ligne.quantite_base, ligne.article.unite_base)} de{" "}
              {nomComplet(ligne.article)} sortiront du stock.
            </li>
          ))}
          {paiements.map((r) => (
            <li key={r.id}>
              Le paiement de {formaterMontant(r.montant)} reviendra sur « {r.compte} ».
            </li>
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
            Garder l&apos;achat
          </Button>
          <Button variant="danger" enCours={enCours} libelleEnCours="Annulation…" onClick={annuler}>
            Annuler l&apos;achat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-texte-2">{libelle}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** Fiche d'un achat (US-ACH-02), dans le panneau latéral de l'historique. */
export function DetailAchat({ achat }: { achat: AchatDetail }) {
  const peutSaisir = usePeut("saisir_achat");
  const etat = etatPaiement(achat);
  const annule = achat.statut === "ANNULE";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={etat.variante}>{etat.libelle}</Badge>
        <span className="text-texte-2">
          Reçu le {formaterDate(achat.date_achat)} · saisi par {achat.auteur}
        </span>
      </div>
      {annule && (
        <p className="rounded-md bg-neutre-fond px-3 py-2 text-neutre">
          Annulé le {achat.annule_le ? formaterDateHeure(achat.annule_le) : ""} par{" "}
          {achat.annule_par} : {achat.motif_annulation}
        </p>
      )}
      <dl className="flex flex-col gap-2">
        <Ligne libelle="Fournisseur">{achat.fournisseur ?? "Non renseigné"}</Ligne>
        {achat.numero_facture_fournisseur && (
          <Ligne libelle="Facture ou bordereau">{achat.numero_facture_fournisseur}</Ligne>
        )}
      </dl>

      <section className="flex flex-col gap-2" aria-label="Articles">
        <h3 className="font-semibold">Articles</h3>
        <ul className="flex flex-col divide-y divide-bordure">
          {achat.lignes.map((ligne) => (
            <li key={ligne.id} className="flex justify-between gap-4 py-2 tabular-nums">
              <span className="flex flex-col">
                <span>{nomComplet(ligne.article)}</span>
                <span className="text-xs text-texte-2">
                  {formaterQuantite(ligne.quantite, ligne.unite)} à{" "}
                  {formaterMontant(ligne.prix_unitaire)}
                  {ligne.unite !== ligne.article.unite_base &&
                    ` · ${formaterQuantite(ligne.quantite_base, ligne.article.unite_base)}`}
                </span>
              </span>
              <span>{formaterMontant(ligne.montant_total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <dl className="bg-fond-2 flex flex-col gap-2 rounded-md p-4 tabular-nums">
        <Ligne libelle="Total">
          <span className="font-semibold">{formaterMontant(achat.montant_total)}</span>
        </Ligne>
        <Ligne libelle="Payé">{formaterMontant(achat.montant_regle)}</Ligne>
        {!annule && !estNul(achat.reste_a_payer) && (
          <Ligne libelle="Reste à payer">
            <span className="font-medium text-attention">
              {formaterMontant(achat.reste_a_payer)}
            </span>
          </Ligne>
        )}
      </dl>

      {achat.reglements.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Paiements">
          <h3 className="font-semibold">Paiements</h3>
          <ul className="flex flex-col divide-y divide-bordure">
            {achat.reglements.map((r) => (
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
      )}

      {peutSaisir && !annule && (
        <>
          {!estNul(achat.reste_a_payer) && achat.fournisseur_id && (
            <FormulairePaiement key={achat.reglements.length} achat={achat} />
          )}
          <div>
            <AnnulationAchat achat={achat} />
          </div>
        </>
      )}
    </div>
  );
}
