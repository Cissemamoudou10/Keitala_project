"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { AccesRefuse } from "@/components/coquille/acces-refuse";
import { ENTREES_ADMINISTRATION } from "@/components/controles/pieces-a-controler";
import { Page } from "@/components/coquille/page";
import { SousNavigation } from "@/components/ui/sous-navigation";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { FormulaireUtilisateur } from "@/components/utilisateurs/formulaire-utilisateur";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { LIBELLES_ROLES, peut } from "@/lib/droits";
import { formaterDateHeure, formaterDateRelative } from "@/lib/formats";
import { useSession, type Utilisateur } from "@/lib/session";

type PageUtilisateurs = {
  items: Utilisateur[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

/** Panneau ouvert : création, ou modification d'un compte de la liste. */
type Edition = { mode: "creation" } | { mode: "modification"; utilisateur: Utilisateur };

/** Gestion des comptes (US-AUTH-02), réservée au Super Admin. */
export function GestionUtilisateurs() {
  const session = useSession();

  if (session.isPending) {
    return (
      <Page titre="Utilisateurs">
        <SqueletteTableau lignes={4} colonnes={4} />
      </Page>
    );
  }
  // Session en erreur : le retour à la connexion est géré globalement (fournisseurs)
  if (!session.data) return null;
  if (!peut(session.data.role, "gerer_utilisateurs")) return <AccesRefuse />;
  return <ListeUtilisateurs moi={session.data} />;
}

function ListeUtilisateurs({ moi }: { moi: Utilisateur }) {
  const router = useRouter();
  const chemin = usePathname();
  const parametres = useSearchParams();
  // La page est gardée dans l'adresse (charte, section 7)
  const page = Math.max(1, Number(parametres.get("page")) || 1);
  const [edition, setEdition] = React.useState<Edition | null>(null);

  const requete = useQuery({
    queryKey: ["utilisateurs", page],
    queryFn: ({ signal }) =>
      appelerApi<PageUtilisateurs>("utilisateurs", { parametres: { page }, signal }),
  });

  const allerALaPage = (numero: number) =>
    router.replace(numero > 1 ? `${chemin}?page=${numero}` : chemin);

  return (
    <Page
      titre="Utilisateurs"
      description="Comptes qui peuvent se connecter, et leur rôle."
      action={
        <Button variant="principal" onClick={() => setEdition({ mode: "creation" })}>
          <Plus />
          Nouvel utilisateur
        </Button>
      }
    >
      <SousNavigation libelle="Administration" entrees={ENTREES_ADMINISTRATION} />
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={4} colonnes={4} />}
        estVide={(donnees) => donnees.total === 0}
        vide={<EtatVide message="Aucun compte pour l'instant." />}
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="hidden lg:table-cell">Dernière connexion</TableHead>
                  <TableHead>
                    <span className="sr-only">État</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((utilisateur) => (
                  <TableRow
                    key={utilisateur.id}
                    className="cursor-pointer"
                    onClick={() => setEdition({ mode: "modification", utilisateur })}
                  >
                    <TableCell>
                      {/* Bouton pour le clavier ; toute la ligne reste cliquable */}
                      <button
                        type="button"
                        className="text-left font-medium"
                        onClick={(evenement) => {
                          evenement.stopPropagation();
                          setEdition({ mode: "modification", utilisateur });
                        }}
                      >
                        {utilisateur.nom_complet}
                      </button>
                    </TableCell>
                    <TableCell className="hidden text-texte-2 md:table-cell">
                      {utilisateur.email}
                    </TableCell>
                    <TableCell>{LIBELLES_ROLES[utilisateur.role]}</TableCell>
                    <TableCell className="hidden text-texte-2 lg:table-cell">
                      {utilisateur.derniere_connexion ? (
                        <span title={formaterDateHeure(utilisateur.derniere_connexion)}>
                          {formaterDateRelative(utilisateur.derniere_connexion)}
                        </span>
                      ) : (
                        "Jamais"
                      )}
                    </TableCell>
                    <TableCell>
                      {/* On ne signale que l'exception (charte, principe 8) */}
                      {!utilisateur.est_actif && <Badge variant="neutre">Inactif</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={donnees.page}
              pagesTotal={donnees.pages_total}
              total={donnees.total}
              onPage={allerALaPage}
            />
          </div>
        )}
      </EtatRequete>

      <Panneau
        ouvert={edition !== null}
        onOuvertChange={(ouvert) => !ouvert && setEdition(null)}
        titre={
          edition?.mode === "modification" ? edition.utilisateur.nom_complet : "Nouvel utilisateur"
        }
        description={
          edition?.mode === "modification"
            ? edition.utilisateur.email
            : "La personne se connectera avec cet email et ce mot de passe."
        }
      >
        {edition && (
          <FormulaireUtilisateur
            key={edition.mode === "modification" ? edition.utilisateur.id : "creation"}
            utilisateur={edition.mode === "modification" ? edition.utilisateur : undefined}
            moi={moi}
            onTermine={() => setEdition(null)}
          />
        )}
      </Panneau>
    </Page>
  );
}
