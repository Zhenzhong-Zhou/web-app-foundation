# Articles

Les articles sont tout ce que votre entreprise garde : ce qu’elle vend, les matières premières dont elle le fabrique, les emballages, les fournitures, les échantillons et l’équipement. Chacun a une ou plusieurs variantes, ce dans quoi le stock est compté, et chaque variante a son propre **Code** : le code inscrit sur son étiquette. D’autres systèmes l’appellent une UGS ou un SKU.

## Les types {#types}

Chaque article appartient à l’un des six types. Chaque type est un onglet de la page Articles, avec son total, et un type sans article n’a pas d’onglet tant qu’il n’en a pas.

- **Produits** : ce que vous vendez à vos clients.
- **Matières premières** : consommées en production.
- **Emballages** : flacons, boîtes et étiquettes.
- **Fournitures** : consommées par l’entreprise elle-même, comme les gants. Votre comptable peut les classer parmi les consommables de faible valeur; les comptes chinois les appellent 低值易耗品.
- **Échantillons** : donnés, pas vendus.
- **Équipement** : machines et outils. L’équipement est reçu, déplacé et compté là où il se trouve, mais il ne fait pas partie de la valeur du stock, car c’est un actif, pas un stock à vendre.

Le type peut être changé à tout moment avec **Modifier l’article** sur la page de l’article. L’article passe dans son nouvel onglet, et son stock, ses lots et son historique restent tels quels.

## Trouver des articles {#find}

La page Articles s’ouvre sur Produits, ou sur le premier type qui a des articles. **Tous** montre tous les types à la fois.

- Le champ **Rechercher** trouve un article par une partie d’un code, ou de son nom ou de celui d’une variante dans n’importe quelle langue, avec ou sans accents; un nom chinois aussi par son pinyin, ou par un seul caractère. Le nombre d’articles sur chaque onglet change selon la recherche. Quand un onglet ne donne aucun résultat, la liste indique où se trouvent les résultats, avec un bouton pour les voir.
- La liste **Catégorie** propose les catégories qui ont des articles dans cet onglet, avec leur total, et **Sans catégorie** pour les articles qui n’en ont aucune. En choisir une montre ses articles et ceux de toutes les catégories qu’elle contient, et une pastille la nomme; le **×** de la pastille montre de nouveau toutes les catégories.
- **Stock bas** montre les articles dont un code est sous son point de commande, ou épuisé, avec leur total; il se place à côté de **Abandonné** et est conservé dans l’adresse. Il compte des articles, pas des codes : un article dont trois codes sont sous leur point compte une fois.
- **Abandonné** montre seuls les articles abandonnés, avec leur total. Autrement, ils sont masqués. **Tout afficher dans Articles**, dans la barre du haut, ouvre Tous avec la recherche et les articles abandonnés inclus, et une pastille qui le dit.
- Appuyez sur **Nom**, **Catégorie**, **En stock** ou la date en tête d’une colonne pour trier selon elle; appuyez de nouveau pour inverser. La colonne de date montre la date selon laquelle la liste est triée, et son menu permet de passer de **Dernière modification** à **Date d’ajout**.
- La liste charge cinquante articles à la fois. **Afficher 50 de plus** ajoute les cinquante suivants, et une ligne dit combien : « 31 articles », ou « 50 sur 312 articles affichés » tant qu’il y en a d’autres. Retour depuis un article ramène la liste avec toutes les lignes que vous aviez affichées.
- **Exporter** télécharge dans un fichier CSV tous les résultats de la liste, pas seulement les lignes déjà chargées.

Sur un téléphone, chaque article est une carte, et **Filtres** ouvre la catégorie, le tri et Abandonné depuis le bas de l’écran.

## Ce que montre une ligne {#rows}

- La photo de couverture, ou une icône du type, puis le nom avec son code dessous. Un article à plusieurs variantes en indique le nombre et les codes.
- Sa catégorie, comme chemin depuis le haut, par exemple Flacons › Bouchons.
- Ce qui est en stock dans tous les emplacements, additionné dans l’unité de l’article, avec « Inutilisable : 72 » à côté quand une partie est périmée, remise à un ordre de fabrication ou à un emplacement non disponible. Quand ses variantes sont comptées en unités différentes, la ligne indique plutôt le nombre de variantes.
- **Bas** ou **Épuisé** à côté du stock, d’après les points de commande de l’article : le statut de son pire code et, pour un article à plusieurs codes, combien le partagent, comme « Bas · 1 sur 3 codes ». Ce sont les mêmes mots et les mêmes couleurs que dans Réapprovisionner. Appuyez dessus pour ouvrir la page de l’article à **État du stock**.

Appuyez sur la ligne pour ouvrir l’article. Appuyez sur son stock pour ouvrir Inventaire pour cet article seul; le **×** de la pastille y montre de nouveau tout le stock, et Retour ramène aux Articles tels qu’ils étaient.

## État du stock {#stands}

Premier sous le titre d’un article, **État du stock** montre chacun de ses codes, les plus bas d’abord, et dit pourquoi chaque chiffre est ce qu’il est. Une partie ne s’affiche que s’il y a quelque chose à dire, et seulement pour une personne qui peut la voir.

- Le statut du code et « Il en reste 10 · point de commande 36 » : le stock utilisable, plus ce qui est à venir, moins ce que les ventes confirmées demandent encore.
- **En stock**, avec ce qui n’est pas utilisable et pourquoi : périmé, remis à un ordre de fabrication, ou à un emplacement non disponible.
- **Libre**, ce que vous pouvez encore promettre, ou « 20 manquants : les commandes en veulent 90 » quand les commandes confirmées en veulent plus qu’il n’y en a.
- **Réservé**, les ventes qui retiennent du stock, chacune un lien, la plus ancienne d’abord, avec ce que chacune retient de ce qu’elle demande.
- **À venir**, les bons de commande et les ordres de fabrication qui doivent encore apporter du stock, chacun avec son jour.
- **Il en reste**, avec son calcul en mots simples : « 30 utilisables + 0 à venir − 20 pour les commandes ».
- **Par emplacement et lot**, chaque emplacement écrit depuis son entrepôt, avec ses lots, les plus proches d’abord, le code de chaque lot un lien vers son suivi, et les **Actions** de chaque lot, comme dans Stock.
- **Derniers mouvements**, les cinq plus récents du code, comme une fiche de stock avec **Entrée**, **Sortie** et **Solde**, qui se terminent par **Tous les mouvements de** ce code, ce qui ouvre [Mouvements](/movements) pour lui. Un code que rien n’a touché n’en a pas.

Les actions, sur la carte du code à côté de son titre, sont **Modifier le point de commande**, et **Acheter** ou **Fabriquer** avec la quantité dans son unité, comme « Acheter 30 unités » ou « Fabriquer 1 000 bouteilles », chacune montrée selon ce que votre rôle permet; sinon, une ligne dit à qui demander. **Acheter** et **Fabriquer** ouvrent leur formulaire rempli avec la commande suggérée et n’enregistrent rien avant que vous ne le créiez. Un code sans stock ni arrivage dit « Rien en stock, rien à venir. » avec **Fixer un point de commande** et **Recevoir du stock**.

> Seule une personne qui peut voir le stock voit **État du stock**. Sans la permission de voir les emplacements, **Lots utilisables** et une ligne « inutilisable » remplacent les emplacements; sans celle de voir les commandes, un nombre dit combien de commandes attendent; les ordres de fabrication demandent la permission de voir la production.

## Catégories {#categories}

Un article appartient à une catégorie ou n’en a aucune. Les catégories forment un seul arbre : une catégorie peut être au premier niveau ou sous une autre, jusqu’à 10 niveaux, comme Emballages › Flacons.

L’arbre, avec les articles de chaque catégorie, s’ouvre avec **Gérer les catégories** au bas de la liste Catégorie.

1. Appuyez sur **Ajouter une catégorie**, saisissez son nom, puis dans **Sous**, choisissez la catégorie qui la contiendra, ou aucune pour la mettre au premier niveau.
2. **Actions** sur une ligne propose **Renommer**, **Déplacer** et **Supprimer**. Une catégorie ne peut pas aller sous elle-même : sa propre branche n’est donc pas proposée.
3. Choisissez la catégorie d’un article avec **Modifier l’article** sur sa page, ou celle de plusieurs avec **Définir la catégorie**.

> Seule une personne qui peut modifier les articles voit **Ajouter une catégorie** et **Actions**. Quiconque peut voir les articles peut lire l’arbre.

## Ajouter un article {#add}

1. Appuyez sur **Ajouter un article**.
2. Sous **Qu’est-ce que c’est?**, choisissez son type. Depuis l’onglet d’un type, ce type est déjà choisi; depuis **Tous**, aucun ne l’est.
3. Saisissez son nom, et choisissez sa **Catégorie**, ou **Aucune**. Quand votre organisation a défini la langue dans laquelle ses articles sont nommés, le champ du nom l’indique : saisissez le nom dans cette langue.
4. Saisissez le **Code** : votre propre code pour cet article, unique dans l’organisation, par exemple RM-VITC pour une matière première. Ce n’est pas un code-barres.
5. Choisissez son unité, ce dans quoi son stock est compté.
6. S’il existe en plusieurs formats, indiquez le format ou la particularité de cette variante, par exemple 60ct.
7. Activez **Suivre les numéros de lot et les dates de péremption** si chaque livraison porte un code de lot. Ce choix ne peut pas être modifié par la suite, et l’équipement ne l’offre jamais.
8. Appuyez sur **Ajouter un article**.

La page du nouvel article s’ouvre à la place du formulaire : Retour ramène donc aux Articles.

## Modifier plusieurs articles à la fois {#several}

Une case à cocher précède chaque ligne, et celle de l’en-tête coche toutes les lignes chargées. Cocher fait apparaître une barre qui indique combien d’articles sont sélectionnés.

- **Définir la catégorie** demande laquelle, ou **Aucune**, puis **Déplacer** les y met.
- **Abandonner** s’exécute aussitôt.
- **Tout désélectionner** décoche tout.

Chaque changement dit ce qu’il a fait et offre **Annuler** pendant 10 secondes, ce qui remet chaque article comme il était. Un autre onglet, une nouvelle recherche, un filtre ou un tri décochent tout, pour que rien de ce que vous ne voyez pas ne soit modifié. Le maximum est de 500 à la fois.

> Seule une personne qui peut modifier les articles voit les cases à cocher.

## Variantes, images et noms {#variants}

Sur la page d’un article, son type et sa catégorie sont sous le nom.

- **Modifier l’article** change le nom, la description, la catégorie et le type.
- **Ajouter une variante** ajoute un autre format, avec son propre code et l’unité dans laquelle son stock est compté.
- **Modifier** sur une variante enregistre son poids, ses dimensions et combien d’unités partent par caisse.
- **Ajouter des images** accepte jusqu’à 8 photos. La première est la couverture, affichée à côté du nom dans les listes.
- **Modifier les noms** donne son nom dans d’autres langues : un écran ou un sélecteur nomme l’article dans la langue de la personne qui lit, s’il a un nom dans cette langue, et un document le nomme dans la langue dans laquelle il s’imprime.

Le tableau **Noms dans d’autres langues** comporte une ligne pour l’article et une pour chaque variante ayant son propre nom, avec une colonne par langue. La ligne de l’article commence par son propre nom, celui donné lors de son ajout.

Quand votre organisation a défini la langue dans laquelle ses articles sont nommés, sous **Les articles sont nommés en** dans [Organisation](/settings/organization#documents), la colonne de cette langue vient en premier et contient le propre nom de chaque ligne, indiqué par **Propre nom de l’article**. C’est le nom dans cette langue : il n’y manque donc jamais, et **Modifier les noms** n’a pas de champ pour lui; changez-le avec **Modifier l’article**. Les noms dans les autres langues sont conservés à côté, et une personne qui lit dans une langue sans nom voit le propre nom. Tant que la langue n’est pas définie, le propre nom s’affiche dans toutes les langues qui n’ont pas de nom particulier; dans la page de l’article, il est indiqué par **Propre nom de l’article** dans sa ligne, et une ligne au-dessus du tableau dit qu’il ne compte encore comme le nom dans aucune langue, et où choisir la langue.

Les langues dans lesquelles vos documents exigent un nom sont indiquées. Un nom exigé mais absent est indiqué par **Manquant**. **Ajouter** ouvre **Modifier les noms** à cette ligne. Une ligne en haut de la page dit que les commandes et les factures contenant l’article ne peuvent pas s’imprimer tant que le nom n’est pas ajouté.

> Seule une personne qui peut ajouter des articles voit **Ajouter un article**, et seule une personne qui peut les modifier voit **Ajouter une variante**, **Modifier l’article**, **Modifier**, **Modifier les noms** et **Abandonner**.

## Rédiger sa recette {#recipe}

Une recette, c’est ce qu’utilise un lot d’une variante.

1. Sur la page de l’article, appuyez sur **Nouvelle recette**. S’il a plusieurs variantes, choisissez d’abord laquelle sous **Pour**.
2. Indiquez combien produit un lot, et la licence sous laquelle il est fabriqué, s’il y en a une, puis appuyez sur **Créer le brouillon**.
3. Appuyez sur **Ajouter un composant** pour chaque chose qu’elle utilise, en quantités par lot, pas par unité.
4. Appuyez sur **Mettre en vigueur**. Les nouveaux ordres de fabrication l’utilisent, et la recette qu’elle remplace est archivée.

Une recette active ne peut pas être modifiée : **Nouvelle version** la copie dans un nouveau brouillon.

> Seule une personne qui peut créer des recettes voit **Nouvelle recette** et **Nouvelle version**, et seule une personne qui peut les modifier voit **Ajouter un composant** et **Mettre en vigueur**.

## Un produit pour deux marchés {#markets}

Un produit vendu sur deux marchés est un seul article, avec une variante par marché :

- Chaque variante a son propre **Code**, par exemple FOCUS-60-CA et FOCUS-60-CN.
- Chacune a sa propre recette, fabriquée sous la licence de son marché : celle de Santé Canada pour l’une, celle de la SAMR pour l’autre.
- Chacune a ses propres noms, pour que la variante destinée à la Chine s’imprime sous le nom 专注胶囊 60 粒.

Deux marchés peuvent aussi partager une licence et un flacon, chaque recette avec sa propre étiquette.

Quand une formule change avec le temps, elle garde son article et son code : appuyez sur **Nouvelle version** dans sa recette, changez ce qu’elle utilise, puis appuyez sur **Mettre en vigueur**.

Les codes-barres viendront plus tard. Le Code est le vôtre, ce n’est pas un code-barres.

## Les mots que vous verrez {#words}

- **Code** : le code sur l’étiquette d’une variante. Chaque variante a le sien.
- **Variante** : un format ou une sorte d’article, ce dans quoi le stock est compté.
- **Propre nom** : le nom donné à un article ou à une variante lors de son ajout. Quand les articles sont nommés dans une langue, c’est son nom dans cette langue.
- **Sans catégorie** : dans aucune catégorie.
- **Stock bas** et **Épuisé** : sous son point de commande, et plus rien en stock, dit d’un article par son pire code. Voir [Points de commande](/inventory#reorder-points) et [ce que chaque total compte](/inventory#counts).
- **Abandonné** : retiré de l’usage avec **Abandonner**, il n’est plus proposé quand on choisit un article. **Réactiver** le rétablit.
- **Brouillon**, **active** et **archivée** : une recette en cours de rédaction, celle en usage, et une recette remplacée.

## Si quelque chose est refusé {#refused}

- Un code déjà utilisé est refusé sous **Code**, avec un lien vers l’article qui l’a. Chaque variante a besoin du sien.
- Une catégorie qui contient des articles ou d’autres catégories ne peut pas être supprimée. Le refus dit combien de chaque : déplacez-les d’abord dans une autre catégorie.
- Une catégorie ne peut pas aller sous elle-même, et deux catégories côte à côte ne peuvent pas porter le même nom.
- Les catégories descendent d’au plus 10 niveaux. Une catégorie ajoutée ou déplacée plus bas est refusée : choisissez un emplacement plus haut.
- Les commandes et les factures ne peuvent pas s’imprimer dans une langue que votre organisation exige tant qu’un article qui s’y trouve n’a pas de nom dans cette langue, sauf la langue dans laquelle les articles sont nommés, que le propre nom de chaque article satisfait. Le refus dit si c’est le nom de l’article ou celui d’une variante qui manque.
- Une recette sans composants ne peut pas être mise en vigueur. Ajoutez d’abord ce qu’elle utilise.
- Un article a au plus 8 images. Retirez-en une pour en ajouter une autre.
- Une exportation de plus de 50 000 lignes est refusée. Choisissez un type ou une catégorie, ou faites une recherche, pour la réduire.
- Jusqu’à 500 articles changent à la fois. Décochez-en quelques-uns pour continuer.

Voir aussi [Inventaire](/inventory), [Licences](/licences) et [Production](/production#plan).
