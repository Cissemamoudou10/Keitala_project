"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { AccesRefuse } from "@/components/coquille/acces-refuse";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { Button } from "@/components/ui/button";
import { Onglets } from "@/components/ui/onglets";
import { SousNavigation } from "@/components/ui/sous-navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi, ErreurApi } from "@/lib/api";
import { formaterDate, formaterMontantSeul } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { useEstHydrate, usePeut } from "@/lib/session";

export type TypeControle = "depense" | "transfert" | "inventaire" | "cloture";

type PieceAControler = {
  type: TypeControle;
  id: string;
  numero: string;
  date: string;
  resume: string;
  montant: string | null;
  auteur: string;
  date_creation: string;
};

export type NombreAControler = { total: number; par_type: Record<TypeControle, number> };

export const CLE_CONTROLES = ["controles"] as const;

const LIBELLES: Record<TypeControle, string> = {
  depense: "Dépenses",
  transfert: "Transferts",
  inventaire: "Inventaires",
  cloture: "Clôtures",
};
const TYPES = Object.keys(LIBELLES) as TypeControle[];

export const ENTREES_ADMINISTRATION = [
  { href: "/administration", libelle: "Utilisateurs" },
  { href: "/administration/controles", libelle: "À contrôler" },
];

/**
 * Contrôle a posteriori (US-TRES-05) : le Super Admin parcourt les opérations sensibles,
 * déjà effectives, et les marque une à une comme contrôlées (date et nom gardés).
 */
export function PiecesAControler() {
  const hydrate = useEstHydrate();
  const peutControler = usePeut("controler");
  if (!hydrate) return <SqueletteTableau lignes={6} colonnes={5} />;
  if (!peutControler) return <AccesRefuse />;
  return <Liste />;
}

function Liste() {
  const { lire, modifier } = useParametresAdresse();
  const type = TYPES.find((t) => t === lire("type")) ?? null;
  const nombre = useQuery({
    queryKey: [...CLE_CONTROLES, "nombre"],
    queryFn: ({ signal }) => appelerApi<NombreAControler>("controles/nombre", { signal }),
  });
  const requete = useQuery({
    queryKey: [...CLE_CONTROLES, "liste", type],
    queryFn: ({ signal }) =>
      appelerApi<PieceAControler[]>("controles/a-controler", { parametres: { type }, signal }),
    placeholderData: (precedent) => precedent,
  });

  return (
    <Page
      titre="Pièces à contrôler"
      description="Opérations déjà effectives, à vérifier après coup. Rien n'attend votre accord."
    >
      <SousNavigation libelle="Administration" entrees={ENTREES_ADMINISTRATION} />
      <Onglets<"tous" | TypeControle>
        libelleAccessible="Pièces à afficher"
        onglets={[
          { valeur: "tous", libelle: "Tout", nombre: nombre.data?.total },
          ...TYPES.map((t) => ({
            valeur: t,
            libelle: LIBELLES[t],
            nombre: nombre.data?.par_type[t],
          })),
        ]}
        actif={type ?? "tous"}
        onChange={(valeur) => modifier({ type: valeur === "tous" ? null : valeur })}
      />
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={6} colonnes={5} />}
        estVide={(pieces) => pieces.length === 0}
        vide={<EtatVide message="Tout est contrôlé." />}
      >
        {(pieces) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Pièce</TableHead>
                <TableHead>Détail</TableHead>
                <TableHead numerique className="hidden md:table-cell">
                  Montant FCFA
                </TableHead>
                <TableHead className="hidden lg:table-cell">Saisie par</TableHead>
                <TableHead>
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pieces.map((piece) => (
                <LignePiece key={`${piece.type}-${piece.id}`} piece={piece} />
              ))}
            </TableBody>
          </Table>
        )}
      </EtatRequete>
    </Page>
  );
}

function LignePiece({ piece }: { piece: PieceAControler }) {
  const clientRequetes = useQueryClient();
  const [enCours, setEnCours] = React.useState(false);

  const marquer = async () => {
    setEnCours(true);
    try {
      await appelerApi<void>(`controles/${piece.type}/${piece.id}`, { methode: "POST" });
      notifier.succes(`${piece.numero} contrôlé`);
      await Promise.all(
        [CLE_CONTROLES, ["tresorerie"], ["stocks"]].map((queryKey) =>
          clientRequetes.invalidateQueries({ queryKey }),
        ),
      );
    } catch (cause) {
      notifier.erreur(cause instanceof ErreurApi ? cause.message : "Le marquage a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-texte-2">{formaterDate(piece.date)}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{piece.numero}</TableCell>
      <TableCell>
        <span className="flex flex-col">
          <span>{piece.resume}</span>
          <span className="text-xs text-texte-2">{LIBELLES[piece.type]}</span>
        </span>
      </TableCell>
      <TableCell numerique className="hidden md:table-cell">
        {piece.montant !== null && piece.type !== "cloture"
          ? formaterMontantSeul(piece.montant)
          : ""}
      </TableCell>
      <TableCell className="hidden text-texte-2 lg:table-cell">{piece.auteur}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="discret"
          enCours={enCours}
          libelleEnCours="…"
          onClick={marquer}
          aria-label={`Marquer ${piece.numero} comme contrôlé`}
        >
          <Check />
          Contrôlé
        </Button>
      </TableCell>
    </TableRow>
  );
}
