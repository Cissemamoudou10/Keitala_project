"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { CLE_ARTICLES, nomComplet } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { SqueletteTableau } from "@/components/etats/squelettes";
import {
  CLE_INVENTAIRES,
  type InventaireDetail,
  type LigneInventaire,
} from "@/components/inventaires/types";
import { ChampMontant } from "@/components/saisie/champ-montant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChampRecherche } from "@/components/ui/champ-recherche";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { appelerApi, ErreurApi } from "@/lib/api";
import { enSaisie, soustraireDecimaux } from "@/lib/decimal";
import { formaterDate, formaterMontant, formaterQuantite } from "@/lib/formats";
import { LIBELLES_FAMILLES, LIBELLES_MOTIFS, type MotifEcart } from "@/lib/libelles";
import { notifier } from "@/lib/notifications";
import { simplifier } from "@/lib/recherche";
import { usePeut } from "@/lib/session";
import { cn } from "@/lib/utils";

const MOTIFS = Object.keys(LIBELLES_MOTIFS) as MotifEcart[];
const QUANTITE_VALIDE = /^\d+([.,]\d{1,3})?$/;

/** Saisie d'une ligne, telle que tapée (virgule décimale). */
type Saisie = { physique: string; motif: MotifEcart | ""; commentaire: string; cout: string };

function saisieDe(ligne: LigneInventaire): Saisie {
  return {
    physique: enSaisie(ligne.stock_physique),
    motif: ligne.motif ?? "",
    commentaire: ligne.commentaire ?? "",
    cout: ligne.cout_unitaire ? ligne.cout_unitaire.replace(/\.\d*$/, "") : "",
  };
}

function ecartDe(ligne: LigneInventaire, saisie: Saisie): string | null {
  if (!QUANTITE_VALIDE.test(saisie.physique.trim())) return null;
  return soustraireDecimaux(saisie.physique.trim().replace(",", "."), ligne.stock_theorique);
}

const sansCoutMoyen = (ligne: LigneInventaire) => /^0+(\.0+)?$/.test(ligne.cout_moyen);

/** « + 12 kg » / « − 3 kg » : le signe porte le sens (charte, section 8). */
function ecartSigne(ecart: string, unite: string): string {
  const negatif = ecart.startsWith("-");
  return `${negatif ? "−" : "+"} ${formaterQuantite(negatif ? ecart.slice(1) : ecart, unite)}`;
}

/** Comptage et validation d'un inventaire (US-STK-04). */
export function SaisieInventaire({ id }: { id: string }) {
  const requete = useQuery({
    queryKey: [...CLE_INVENTAIRES, id],
    queryFn: ({ signal }) => appelerApi<InventaireDetail>(`stocks/inventaires/${id}`, { signal }),
  });
  return (
    <EtatRequete
      requete={requete}
      chargement={
        <Page titre="Inventaire">
          <SqueletteTableau lignes={8} colonnes={5} />
        </Page>
      }
    >
      {(inventaire) => <Comptage key={inventaire.statut} inventaire={inventaire} />}
    </EtatRequete>
  );
}

function Comptage({ inventaire }: { inventaire: InventaireDetail }) {
  const clientRequetes = useQueryClient();
  const modifiable = usePeut("saisir_stock") && inventaire.statut === "EN_COURS";
  const [saisies, setSaisies] = React.useState<Record<string, Saisie>>(() =>
    Object.fromEntries(inventaire.lignes.map((l) => [l.article.id, saisieDe(l)])),
  );
  const [aCorriger, setACorriger] = React.useState<Set<string>>(new Set());
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [recherche, setRecherche] = React.useState("");
  const [enregistrement, setEnregistrement] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState(false);
  const [validation, setValidation] = React.useState(false);

  const lignesModifiees = inventaire.lignes.filter((ligne) => {
    const avant = saisieDe(ligne);
    const apres = saisies[ligne.article.id];
    return (Object.keys(avant) as (keyof Saisie)[]).some((cle) => avant[cle] !== apres[cle]);
  });
  const modifie = lignesModifiees.length > 0;

  // Ne jamais perdre une saisie : avertir avant de quitter la page (charte, section 10)
  React.useEffect(() => {
    if (!modifie) return;
    const avertir = (evenement: BeforeUnloadEvent) => evenement.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const ecarts = inventaire.lignes
    .map((ligne) => ({ ligne, ecart: ecartDe(ligne, saisies[ligne.article.id]) }))
    .filter(({ ecart }) => ecart !== null && ecart !== "0");
  const incompletes = ecarts.filter(({ ligne, ecart }) => {
    const saisie = saisies[ligne.article.id];
    const coutManquant = !ecart!.startsWith("-") && sansCoutMoyen(ligne) && !saisie.cout;
    return !saisie.motif || coutManquant;
  });
  const quantitesInvalides = inventaire.lignes.filter(
    (ligne) => !QUANTITE_VALIDE.test(saisies[ligne.article.id].physique.trim()),
  );

  const changer = (articleId: string, valeurs: Partial<Saisie>) => {
    setSaisies((actuelles) => ({
      ...actuelles,
      [articleId]: { ...actuelles[articleId], ...valeurs },
    }));
    setACorriger((actuels) => {
      const suivants = new Set(actuels);
      suivants.delete(articleId);
      return suivants;
    });
  };

  const signalerErreur = (cause: unknown) => {
    if (cause instanceof ErreurApi) {
      const ids = [cause.details?.article_id, ...((cause.details?.articles as string[]) ?? [])];
      setACorriger(new Set(ids.filter((v): v is string => typeof v === "string")));
      setErreur(cause.message);
    } else {
      setErreur("Une erreur inattendue est survenue. Votre comptage est conservé ; réessayez.");
    }
  };

  /** Envoie les lignes modifiées. Renvoie faux si la saisie doit d'abord être complétée. */
  const enregistrer = async (): Promise<boolean> => {
    setErreur(null);
    if (quantitesInvalides.length > 0) {
      setACorriger(new Set(quantitesInvalides.map((l) => l.article.id)));
      setErreur("Les quantités comptées sont des nombres positifs, 3 décimales au plus.");
      return false;
    }
    const sansMotif = ecarts.filter(({ ligne }) => !saisies[ligne.article.id].motif);
    if (sansMotif.length > 0) {
      setACorriger(new Set(sansMotif.map(({ ligne }) => ligne.article.id)));
      setErreur("Indiquez le motif de chaque écart (lignes signalées).");
      return false;
    }
    if (!modifie) return true;
    setEnregistrement(true);
    try {
      const resultat = await appelerApi<InventaireDetail>(`stocks/inventaires/${inventaire.id}`, {
        methode: "PUT",
        corps: {
          lignes: lignesModifiees.map((ligne) => {
            const saisie = saisies[ligne.article.id];
            return {
              article_id: ligne.article.id,
              stock_physique: saisie.physique.trim().replace(",", "."),
              motif: saisie.motif || null,
              commentaire: saisie.commentaire.trim() || null,
              cout_unitaire: saisie.cout || null,
            };
          }),
        },
      });
      clientRequetes.setQueryData([...CLE_INVENTAIRES, inventaire.id], resultat);
      setSaisies(Object.fromEntries(resultat.lignes.map((l) => [l.article.id, saisieDe(l)])));
      return true;
    } catch (cause) {
      signalerErreur(cause);
      return false;
    } finally {
      setEnregistrement(false);
    }
  };

  const valider = async () => {
    setValidation(true);
    setErreur(null);
    try {
      const resultat = await appelerApi<InventaireDetail>(
        `stocks/inventaires/${inventaire.id}/valider`,
        { methode: "POST" },
      );
      clientRequetes.setQueryData([...CLE_INVENTAIRES, inventaire.id], resultat);
      await clientRequetes.invalidateQueries({ queryKey: CLE_ARTICLES });
      await clientRequetes.invalidateQueries({ queryKey: ["stocks"] });
      notifier.succes(
        `Inventaire ${resultat.numero} validé : ${resultat.nombre_ecarts} ajustement${resultat.nombre_ecarts > 1 ? "s" : ""} au journal`,
        { libelle: "Voir les mouvements", href: "/stocks/mouvements?type=AJUSTEMENT_INVENTAIRE" },
      );
    } catch (cause) {
      signalerErreur(cause);
    } finally {
      setValidation(false);
      setConfirmation(false);
    }
  };

  const filtre = simplifier(recherche.trim());
  const visibles = inventaire.lignes.filter(
    (ligne) =>
      !filtre ||
      simplifier(`${nomComplet(ligne.article)} ${ligne.article.code_sku}`).includes(filtre),
  );

  return (
    <Page
      titre={`Inventaire ${inventaire.numero}`}
      description={[
        inventaire.famille ? LIBELLES_FAMILLES[inventaire.famille] : "Toutes les familles",
        `ouvert le ${formaterDate(inventaire.date_creation)} par ${inventaire.auteur}`,
        inventaire.valide_le ? `validé le ${formaterDate(inventaire.valide_le)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="discret" asChild>
          <Link href="/stocks/inventaires">
            <ArrowLeft />
            Tous les inventaires
          </Link>
        </Button>
        {inventaire.statut === "EN_COURS" && <Badge variant="info">En cours</Badge>}
      </div>
      {inventaire.observations && <p className="text-texte-2">{inventaire.observations}</p>}
      <ChampRecherche libelle="Chercher un article" valeur={recherche} onChange={setRecherche} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Article</TableHead>
            <TableHead numerique className="hidden md:table-cell">
              Théorique
            </TableHead>
            <TableHead numerique>Compté</TableHead>
            <TableHead numerique>Écart</TableHead>
            <TableHead>Motif</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((ligne) => {
            const saisie = saisies[ligne.article.id];
            const ecart = ecartDe(ligne, saisie);
            const aEcart = ecart !== null && ecart !== "0";
            const excedentSansCout = aEcart && !ecart.startsWith("-") && sansCoutMoyen(ligne);
            const signalee = aCorriger.has(ligne.article.id);
            const nom = nomComplet(ligne.article);
            return (
              <TableRow key={ligne.id} className={cn(signalee && "bg-danger-fond")}>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="font-medium">{nom}</span>
                    <span className="text-xs text-texte-2 tabular-nums">
                      {ligne.article.code_sku}
                    </span>
                  </span>
                </TableCell>
                <TableCell numerique className="hidden text-texte-2 md:table-cell">
                  {formaterQuantite(ligne.stock_theorique, ligne.article.unite_base)}
                </TableCell>
                <TableCell numerique>
                  {modifiable ? (
                    <span className="inline-flex items-center gap-2">
                      <Input
                        aria-label={`Quantité comptée : ${nom}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={saisie.physique}
                        onChange={(e) => changer(ligne.article.id, { physique: e.target.value })}
                        aria-invalid={signalee || undefined}
                        className="w-24 text-right tabular-nums"
                      />
                      <span className="text-texte-2">{ligne.article.unite_base}</span>
                    </span>
                  ) : (
                    formaterQuantite(ligne.stock_physique, ligne.article.unite_base)
                  )}
                </TableCell>
                <TableCell numerique className="whitespace-nowrap">
                  {aEcart ? ecartSigne(ecart, ligne.article.unite_base) : ""}
                </TableCell>
                <TableCell className="min-w-56">
                  {aEcart &&
                    (modifiable ? (
                      <div className="flex flex-col gap-2 py-2">
                        <Select
                          value={saisie.motif}
                          onValueChange={(v) =>
                            changer(ligne.article.id, { motif: v as MotifEcart })
                          }
                        >
                          <SelectTrigger
                            aria-label={`Motif de l'écart : ${nom}`}
                            aria-invalid={(signalee && !saisie.motif) || undefined}
                          >
                            <SelectValue placeholder="Choisir le motif" />
                          </SelectTrigger>
                          <SelectContent>
                            {MOTIFS.map((m) => (
                              <SelectItem key={m} value={m}>
                                {LIBELLES_MOTIFS[m]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          aria-label={`Précision : ${nom}`}
                          placeholder="Précision (facultatif)"
                          maxLength={200}
                          value={saisie.commentaire}
                          onChange={(e) =>
                            changer(ligne.article.id, { commentaire: e.target.value })
                          }
                        />
                        {excedentSansCout && (
                          <div className="flex flex-col gap-1">
                            <ChampMontant
                              aria-label={`Coût unitaire : ${nom}`}
                              value={saisie.cout}
                              onChange={(cout) => changer(ligne.article.id, { cout })}
                              aria-invalid={(signalee && !saisie.cout) || undefined}
                            />
                            <span className="text-xs text-texte-2">
                              Coût par {ligne.article.unite_base} : l&apos;article n&apos;a pas
                              encore de coût moyen (stock de départ).
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="flex flex-col">
                        <span>{saisie.motif ? LIBELLES_MOTIFS[saisie.motif] : ""}</span>
                        {ligne.commentaire && (
                          <span className="text-xs text-texte-2">{ligne.commentaire}</span>
                        )}
                        {ligne.cout_unitaire && (
                          <span className="text-xs text-texte-2 tabular-nums">
                            Coût : {formaterMontant(ligne.cout_unitaire)} par{" "}
                            {ligne.article.unite_base}
                          </span>
                        )}
                      </span>
                    ))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {modifiable && (
        // Récapitulatif fixe, bouton principal toujours visible (charte, section 10)
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-bordure bg-fond px-4 py-3 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
          {erreur && (
            <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
              {erreur}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-texte-2 tabular-nums">
              {ecarts.length} écart{ecarts.length > 1 ? "s" : ""} sur {inventaire.lignes.length}{" "}
              article{inventaire.lignes.length > 1 ? "s" : ""}
              {incompletes.length > 0 && ` · ${incompletes.length} à compléter`}
              {modifie && " · modifications non enregistrées"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                enCours={enregistrement}
                disabled={!modifie}
                onClick={async () => {
                  if (await enregistrer()) notifier.succes("Comptage enregistré");
                }}
              >
                Enregistrer le comptage
              </Button>
              <Button
                variant="principal"
                disabled={enregistrement}
                onClick={async () => {
                  if (await enregistrer()) setConfirmation(true);
                }}
              >
                Valider l&apos;inventaire
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmation} onOpenChange={(ouvert) => !validation && setConfirmation(ouvert)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider l&apos;inventaire {inventaire.numero}</DialogTitle>
            <DialogDescription>
              {ecarts.length === 0
                ? "Aucun écart : le stock est conforme au comptage."
                : `${ecarts.length} ajustement${ecarts.length > 1 ? "s" : ""} ${ecarts.length > 1 ? "seront écrits" : "sera écrit"} au journal des mouvements.`}{" "}
              L&apos;inventaire ne pourra plus être modifié.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmation(false)} disabled={validation}>
              Revenir au comptage
            </Button>
            <Button
              variant="principal"
              enCours={validation}
              libelleEnCours="Validation…"
              onClick={valider}
            >
              Valider l&apos;inventaire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
