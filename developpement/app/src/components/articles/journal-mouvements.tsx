"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { SousNavigationStocks } from "@/components/articles/sous-navigation-stocks";
import { nomComplet, type Article } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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
import { formaterDateHeure, formaterDateRelative, formaterQuantite } from "@/lib/formats";
import { LIBELLES_MOUVEMENTS, type TypeMouvement } from "@/lib/libelles";
import { useParametresAdresse } from "@/lib/parametres-adresse";

type Mouvement = {
  id: number;
  date_mouvement: string;
  article: Pick<Article, "id" | "code_sku" | "designation" | "contenance" | "unite_base">;
  type_mouvement: TypeMouvement;
  quantite: string;
  stock_avant: string;
  stock_apres: string;
  reference_document: string | null;
  motif: string | null;
  auteur: string;
};

type PageMouvements = {
  items: Mouvement[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

const TYPES = Object.keys(LIBELLES_MOUVEMENTS) as TypeMouvement[];
const TOUS = "tous";

/** Quantité signée : le signe porte le sens, pas seulement une couleur (charte, section 8). */
function quantiteSignee(quantite: string, unite: string): string {
  const sortie = quantite.startsWith("-");
  const absolue = formaterQuantite(sortie ? quantite.slice(1) : quantite, unite);
  return `${sortie ? "−" : "+"} ${absolue}`;
}

/** Journal des mouvements de stock (US-STK-05), du plus récent au plus ancien. */
export function JournalMouvements() {
  const { lire, modifier, page } = useParametresAdresse();
  const articleId = lire("article") || null;
  const type = (TYPES as string[]).includes(lire("type")) ? (lire("type") as TypeMouvement) : null;
  const du = lire("du") || null;
  const au = lire("au") || null;

  const article = useQuery({
    queryKey: ["articles", articleId],
    queryFn: ({ signal }) => appelerApi<Article>(`articles/${articleId}`, { signal }),
    enabled: articleId !== null,
  });
  const requete = useQuery({
    queryKey: ["stocks", "mouvements", { articleId, type, du, au, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageMouvements>("stocks/mouvements", {
        parametres: { article_id: articleId, type_mouvement: type, du, au, page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });
  const filtre = articleId || type || du || au;

  return (
    <Page titre="Stocks" description="Chaque entrée et chaque sortie, avec sa pièce et son auteur.">
      <SousNavigationStocks />
      <div className="flex flex-wrap items-end gap-4">
        <Champ libelle="Type de mouvement">
          {(controle) => (
            <Select
              value={type ?? TOUS}
              onValueChange={(valeur) => modifier({ type: valeur === TOUS ? null : valeur })}
            >
              <SelectTrigger {...controle} className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOUS}>Tous les mouvements</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LIBELLES_MOUVEMENTS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Champ>
        <Champ libelle="Du">
          {(controle) => (
            <Input
              type="date"
              value={du ?? ""}
              onChange={(e) => modifier({ du: e.target.value })}
              className="w-44"
              {...controle}
            />
          )}
        </Champ>
        <Champ libelle="Au">
          {(controle) => (
            <Input
              type="date"
              value={au ?? ""}
              onChange={(e) => modifier({ au: e.target.value })}
              className="w-44"
              {...controle}
            />
          )}
        </Champ>
        {articleId && (
          <Button variant="secondaire" onClick={() => modifier({ article: null })}>
            Article : {article.data ? nomComplet(article.data) : "…"}
            <X aria-label="Retirer le filtre" />
          </Button>
        )}
      </div>

      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={8} colonnes={6} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={
              filtre
                ? "Aucun mouvement pour ces critères."
                : "Aucun mouvement de stock pour l'instant. Ils apparaîtront avec les inventaires, les achats et les ventes."
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
                  {!articleId && <TableHead>Article</TableHead>}
                  <TableHead>Mouvement</TableHead>
                  <TableHead numerique>Quantité</TableHead>
                  <TableHead numerique className="hidden lg:table-cell">
                    Stock avant
                  </TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Stock après
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Pièce</TableHead>
                  <TableHead className="hidden lg:table-cell">Auteur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-texte-2">
                      <span title={formaterDateHeure(m.date_mouvement)}>
                        {formaterDateRelative(m.date_mouvement)}
                      </span>
                    </TableCell>
                    {!articleId && (
                      <TableCell>
                        <button
                          type="button"
                          className="text-left"
                          title="Voir les mouvements de cet article"
                          onClick={() => modifier({ article: m.article.id })}
                        >
                          {nomComplet(m.article)}
                        </button>
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="flex flex-col">
                        <span>{LIBELLES_MOUVEMENTS[m.type_mouvement]}</span>
                        {m.motif && <span className="text-xs text-texte-2">{m.motif}</span>}
                      </span>
                    </TableCell>
                    <TableCell numerique>
                      {quantiteSignee(m.quantite, m.article.unite_base)}
                    </TableCell>
                    <TableCell numerique className="hidden text-texte-2 lg:table-cell">
                      {formaterQuantite(m.stock_avant, m.article.unite_base)}
                    </TableCell>
                    <TableCell numerique className="hidden md:table-cell">
                      {formaterQuantite(m.stock_apres, m.article.unite_base)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap tabular-nums md:table-cell">
                      {m.reference_document ?? ""}
                    </TableCell>
                    <TableCell className="hidden text-texte-2 lg:table-cell">{m.auteur}</TableCell>
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
    </Page>
  );
}
