# Tracer un lot

Un lot est une quantité avec son propre code et sa date de péremption, reçue d’un fournisseur ou fabriquée par un ordre de fabrication. Tracer un lot montre où il se trouve, d’où il vient, dans quoi il a été utilisé et qui l’a reçu : la liste qu’un rappel doit joindre.

## Tracer un lot {#trace}

1. Ouvrez **Tracer un lot**.
2. Saisissez n’importe quelle partie du code de lot, ou du lot du fournisseur gardé à côté d’un code créé chez nous; le numéro de lot suffit généralement. Appuyez sur Entrée.
3. Choisissez le lot parmi ceux listés. Son code complet l’ouvre directement.

Vous pouvez aussi trouver un lot par son code ou par le lot du fournisseur avec **Tout rechercher** : sa ligne donne le code de son article, puis sa date de péremption ou **Date de péremption à ajouter**, puis le lot du fournisseur ou **Lot du fournisseur à ajouter**. Vous pouvez aussi appuyer sur le code d’un lot partout où il est listé : dans l’inventaire, sous **État du stock** sur la page d’un article, et sous **En attente d’un coût** dans Valeur du stock. **Tracer le lot** sur une ligne de l’inventaire l’ouvre aussi.

## Lire une traçabilité {#read}

Sous le code du lot, le nom de son article ouvre la page de l’article, pour qui peut voir les articles, et **Tous les mouvements de ce lot** ouvre Mouvements sur son article, pour ce lot seul et toute son histoire, sans dates.

- **Où il se trouve** : chaque emplacement qui en contient, écrit par son chemin complet depuis son entrepôt, et combien. Une personne qui ne peut pas voir les emplacements lit plutôt la quantité **Utilisable** et **Inutilisable**, sans aucun emplacement nommé.
- **D’où il vient** : sa réception et la commande du fournisseur, ou l’ordre de fabrication qui l’a produit et sa licence. Une réception sans commande dit de qui elle vient, s’il a été indiqué, et pourquoi, par exemple « Reçu sans commande : stock d’ouverture »; du stock venu d’un autre lot nomme ce lot; et le lot créé au début du suivi par lot indique « Stock en main au début du suivi par lot ».
- **Fabriqué à partir de** : les lots de composants qu’un ordre de fabrication a utilisés, peu importe le nombre d’étapes.
- **Utilisé dans** : les ordres de fabrication qui l’ont utilisé, et les lots qu’ils ont produits.
- **Qui l’a reçu** : chaque client à qui ce lot, ou ce qui en a été fabriqué, a été expédié ou donné en échantillon, et ce qui est revenu. Une partie déplacée vers un autre lot y est suivie : qui a reçu cet autre lot figure aussi, sa colonne **Par le lot** nommant ce lot, qui ouvre sa page. Sous le code du lot, une ligne dit combien de partenaires l’ont reçu; appuyez dessus pour aller à la liste. Sur un téléphone, chacun est une carte.

Certaines unités ont pu partir sans destinataire enregistré : expédiées sans commande, ou données en échantillon sans nom. Elles figurent sans partenaire.

À côté de **Qui l’a reçu**, **Exporter** écrit la liste de rappel : les mêmes lignes, dans votre langue, le lot du fournisseur de chaque lot à côté de son code, avec ce qui a été expédié, donné en échantillon et retourné, et le jour où le lot est parti la première fois. Ses titres et ses mots sont dans votre langue, le jour est écrit année-mois-jour, et les quantités sont écrites simplement, 600 et non 600.0000. À l’écran, une date de péremption passée dit depuis combien de temps : « Expiré depuis 4 jours ».

> Seule une personne qui peut voir les coûts voit le coût du lot et l’évolution de sa valeur.

## Les mots que vous verrez {#words}

- **Code de lot** : le code imprimé sur la boîte, ou un code attribué ici.
- **Étapes** : combien d’ordres de fabrication séparent ce lot de l’autre.
- **Non disponible** : un emplacement dont le stock n’est pas à expédier, comme un casier de retours à vérifier.
- **Lot** : ce que produit un ordre de fabrication est aussi un lot, comme un lot reçu.

Voir aussi [Inventaire](/inventory) et [Production](/production).
