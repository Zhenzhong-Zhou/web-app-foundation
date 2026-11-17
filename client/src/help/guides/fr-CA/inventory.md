# Inventaire

L’inventaire montre ce que vous avez et où : une ligne par code, qui s’ouvre sur les emplacements où il se trouve et sur les lots de chacun. D’ici, vous recevez le stock arrivé sans commande, vous le déplacez et vous corrigez un compte de stock. Son second onglet, **Réapprovisionner**, indique quels articles commencent à manquer, et les achète ou les fabrique.

## Lire le stock {#stock}

Dans **Stock**, chaque ligne est un code, celui de l’étiquette d’une variante : un article offert en trois formats a donc trois lignes. La liste contient tous les codes qui sont en stock, qu’une vente confirmée attend, qui est à venir, ou qu’un point de commande surveille; **Afficher les emplacements vidés** ajoute les autres. Elle charge cinquante lignes à la fois, et **Afficher 50 de plus** ajoute les cinquante suivantes.

- Le nom d’abord, son code en gris dessous, et son type. Appuyez sur le nom, ou sur la ligne, pour ouvrir la page de l’article.
- **Où** : le nombre d’emplacements qui en contiennent, comme « 2 emplacements ». Appuyez dessus pour ouvrir les emplacements, puis sur les lots d’un emplacement pour les ouvrir : les lots qui expirent en premier en haut, les périmés au-dessus, un lot sans date d’expiration en dernier. Le code d’un lot ouvre son suivi.
- **En stock** : chaque unité à chaque emplacement, utilisable ou non. Ce qui n’est pas utilisable est indiqué dessous, comme « Inutilisable : 12 » : périmé, remis à un ordre de fabrication, ou à un emplacement non disponible.
- **Libre** : ce que vous pouvez encore promettre, le stock utilisable moins ce qui est réservé, jamais sous 0. Ce que les commandes confirmées demandent au-delà est indiqué dessous, comme « 20 manquants »; appuyez dessus pour voir les commandes en attente.
- **Réservé** : gardé pour les ventes confirmées, la plus ancienne d’abord.
- **À venir** : ce que les achats confirmés et les ordres lancés doivent encore apporter, avec le premier jour prévu.
- **Statut** : **Bas**, **Épuisé** ou **Suffisant**, avec « Il en reste 10 · point de commande 36 » dessous pour un code qui a un point de commande. Appuyez sur la ligne pour voir où en est le code.
- **Expire en premier** : la première date de péremption du stock utilisable.
- **Actions** : les actions de la ligne, plus bas.

Sous 600 px, chaque code est une carte avec **En stock** et **Libre**, et **Filtres** contient ce que l’écran n’a pas la place d’afficher. De 600 à 899 px, **Réservé** et **À venir** quittent le tableau.

> Une personne qui ne peut pas voir les emplacements lit « 3 lots » à la place des emplacements, ouvre directement les lots, et n’a pas la liste **Emplacement**.

## Trouver du stock {#find}

- Les filtres rapides montrent seulement ce qu’ils nomment, chacun avec son total : **Stock bas** (les épuisés aussi), **Épuisé**, **Expire bientôt** (les périmés aussi), **Périmés** et **En attente d’un coût**. Un total est le nombre de lignes que le filtre montre, les autres filtres restant actifs : appuyez sur l’un et la liste a cette longueur.
- **Type**, **Catégorie** et **Emplacement** réduisent la liste, et **Rechercher des articles, des codes ou des lots** trouve un code, le nom d’un article ou le code d’un lot. Un message dit quand rien ne correspond, avec **Afficher tout le stock**.
- Appuyez sur **En stock** ou **Expire en premier** en tête d’une colonne pour trier selon elle, et de nouveau pour inverser; le nom est le tri par défaut. Un code sans rien qui expire vient en dernier dans les deux sens. Libre n’est pas un tri.
- Choisissez un emplacement sous **Emplacement** et la liste montre ce qui s’y trouve : **En stock ici**, **Lots ici** et **Expire en premier ici** sont ceux de cet emplacement, tandis que **Libre, tous les emplacements** et **Réservé, tous les emplacements** comptent tous les emplacements, puisqu’une vente réserve un article, pas une tablette. Le code d’un lot cherché avec un emplacement choisi trouve ce lot à cet emplacement seulement.
- Chaque filtre, le regroupement et le tri sont dans l’adresse : un rechargement et le retour arrière les conservent. **Exporter** écrit les lignes que la liste montre, avec ses filtres, dans les mots de l’écran et dans votre langue.

## Regrouper par lot {#lots}

Choisir **Lot** sous **Regrouper par** change la liste en une ligne par lot à chaque emplacement : le lot qui expire en premier en haut, les périmés au-dessus, les emplacements d’un lot ensemble, chacun disant « 1 sur 2 emplacements » pour que ses lignes se lisent comme un seul lot. Ses filtres sont **Stock bas**, **Expire bientôt**, **Périmés** et **En attente d’un coût**; il n’y a pas de filtre **Épuisé**, puisqu’un article épuisé n’a pas de lots, et le choisir dit « Les articles épuisés n’ont pas de lots. » avec **Regrouper par article** pour revenir.

La tuile **Expire bientôt** de l’accueil ouvre cette vue, les plus proches d’abord, les périmés en tête, et compte ces lignes.

## Recevoir du stock {#receive}

1. Appuyez sur **Recevoir du stock**.
2. Choisissez l’article, et l’emplacement où il va, sous **Vers**. Seuls les emplacements qui contiennent directement du stock sont proposés.
3. Saisissez la quantité, dans l’unité de l’article.
4. Pour un article suivi par lot, saisissez le numéro de lot et la date de péremption tels qu’imprimés sur la boîte. Chaque nouvelle réception du même lot augmente sa quantité.
5. Appuyez sur **Recevoir**.

Les marchandises envoyées par un fournisseur pour un achat sont plutôt reçues sur la commande, dans [Commandes](/orders). Le stock reçu ici n’a pas de coût tant qu’un coût n’est pas défini dans [Valeur du stock](/costs); il figure alors sous **En attente d’un coût**.

## Déplacer, sortir du stock ou corriger {#move}

Chaque ligne a ses **Actions**, selon ce qu’elle est :

- La ligne d’un article : **Déplacer…**, **Sortie de stock…**, **Envoyer un échantillon…** et **Corriger le compte…**; **Recevoir du stock…**, l’article déjà choisi; **Mouvements** et **Modifier le point de commande…**. Quand l’article est un seul lot à un seul emplacement, les quatre premières agissent dessus directement. Sinon, le menu dit qu’un lot est à choisir ensuite, et la ligne s’ouvre sur ses lots sous « Choisissez le lot à déplacer », chaque lot avec ses propres Actions. Sans rien en stock, Déplacer, Sortie de stock et Envoyer un échantillon sont grisés, la raison en dessous; Corriger le compte ouvre ses emplacements et ses lots vidés; un article jamais en stock à cet endroit dit de le recevoir d’abord.
- La ligne d’un emplacement : ses **Mouvements** à cet endroit, un lien.
- La ligne d’un lot : **Déplacer…**, **Sortie de stock…**, **Envoyer un échantillon…** et **Corriger le compte…**; **Modifier le lot…** et **Tracer le lot**; **Mouvements**. Un lot vidé dit quand il l’a été.

Ce que fait chacune :

- **Déplacer…** : vers un autre emplacement, comme du quai vers une tablette.
- **Sortie de stock…** : du stock qui part sans commande. Les marchandises d’un client partent de sa vente, dans Commandes.
- **Envoyer un échantillon…** : un don, avec la personne à qui il a été remis, pour qu’un rappel puisse le retrouver.
- **Corriger le compte…** : combien la tablette contient de plus ou de moins que ce qui est enregistré, pourquoi, et ce qui s’est passé.
- **Modifier le lot…**, **Tracer le lot** et **Mouvements** : le lot, où il est allé, et ses mouvements.
- **Modifier le point de commande…** : le point de commande de l’article, plus bas.

> Toute personne qui peut voir le stock voit **Mouvements** et **Tracer le lot**. Seule une personne qui peut déplacer du stock voit **Recevoir du stock** et ce qui change le stock, et seule une personne qui peut corriger les comptes voit **Corriger le compte…**.

## Ce que chaque total compte {#counts}

Un nombre sur un filtre ou une tuile compte une seule sorte de chose, la même partout.

- **Stock**, par article, compte des codes : un total de **Stock bas** de 4, ce sont quatre codes, où qu’ils soient.
- **Stock**, par lot, compte des lots à chaque emplacement : un lot à deux emplacements fait deux lignes et compte deux fois.
- **Réapprovisionner**, et **Stock bas** sur l’accueil, comptent des codes : un article dont trois codes sont sous leur point en compte trois.
- **Expire bientôt** sur l’accueil compte des lots à chaque emplacement, les lignes de la vue par lot.
- **Articles** compte des articles : son **Stock bas** compte un article une seule fois, quel que soit le nombre de ses codes bas, et son badge dit « Bas · 1 sur 3 codes ». Voir [Articles](/items#rows).

## Points de commande {#reorder-points}

Un point de commande est le niveau sous lequel un article commence à manquer : en dessous de ce niveau, l’article est indiqué comme ayant un stock bas ici, sur l’accueil et dans les notifications, avec ce qu’il faut commander. Un article sans point de commande n’est jamais considéré comme ayant un stock bas.

1. Dans **Réapprovisionner**, appuyez sur **Ajouter un point de commande**, ou choisissez **Modifier le point de commande…** dans les **Actions** d’un article de **Stock**.
2. Choisissez l’article, et s’il est **Acheté** ou **Fabriqué**. Fabriqué est choisi pour vous quand l’article a une recette active.
3. Saisissez le **Point de commande**, dans l’unité de l’article, et choisissez combien commander.
4. **Aujourd’hui** montre où en est l’article maintenant et après la commande suggérée. Appuyez sur **Ajouter un point de commande**, ou sur **Enregistrer** pour une modification.

Les actions de chaque ligne proposent **Modifier le point de commande**, **Stock de l’article** et **Retirer le point de commande**. Retirer un point de commande ne change ni le stock ni les commandes de l’article. Un article abandonné garde son point de commande, mais n’est jamais considéré comme ayant un stock bas.

> Toute personne qui peut voir le stock voit la liste. Seule une personne qui peut définir les points de commande voit **Ajouter un point de commande**, **Modifier le point de commande…** et les actions de chaque ligne : au départ, le propriétaire seul, jusqu’à ce qu’un rôle le permette.

## Où en est un article {#position}

La position d’un article = utilisable + à venir − encore requis : le stock aux emplacements marqués disponibles, moins les lots périmés et ce qui a été remis aux ordres de fabrication; plus les bons de commande confirmés qui restent à recevoir et la production des ordres lancés qui reste à venir; moins les commandes clients confirmées qui restent à expédier. Ainsi, un bon de commande déjà créé ne déclenche pas une nouvelle commande. Résumée en une ligne, elle se lit « Il en reste 10 · point de commande 36 », et appuyer dessus ouvre la page de l’article à [État du stock](/items#stands), qui énumère ce qui compose chaque chiffre.

Un article est **Bas** sous son point, **Épuisé** à zéro ou moins, et **Suffisant** autrement. La liste s’ouvre avec les plus grandes quantités à commander en premier; appuyez sur **Statut** pour mettre d’abord les plus loin sous leur point, ou, sur un téléphone, choisissez **Stock bas d’abord** sous **Tri**. **Stock bas** montre aussi les épuisés. Ouvrez une ligne pour voir ce qui compose sa position et quelles commandes sont en retard; sur un téléphone, où chaque article est une carte, touchez la ligne qui dit combien il en reste, qui ouvre le stock de l’article.

## Combien commander {#how-much}

- **Juste assez** : le manque, pour revenir au point.
- **Quantité fixe** : par multiples entiers, comme un fournisseur vend par caisses. S’il manque 1 500 unités et que les commandes se font par 1 000, cette règle suggère 2 × 1 000.
- **Jusqu’à un maximum** : remplit jusqu’à un niveau au-dessus du point.

Les bons de commande et les ordres de fabrication en brouillon s’affichent **En brouillon**. Ils ne comptent pas comme à venir, puisqu’un brouillon peut ne jamais partir, mais leurs quantités sont déduites de la **Commande suggérée**. Si les brouillons couvrent le manque d’un article dont le stock est bas, sa case indique **Déjà dans un brouillon**, pour éviter une deuxième commande.

## Commander ou fabriquer les articles dont le stock est bas {#order}

- **Acheté** : appuyez sur **Acheter** et sa quantité sur la ligne, ou cochez-en plusieurs et appuyez sur **Acheter les 2 articles sur un seul bon de commande** dans la barre qui apparaît. Un nouveau bon de commande s’ouvre avec une ligne par article, pour la quantité suggérée. Choisissez le fournisseur sous **Partenaire**, vérifiez les quantités et les prix, et appuyez sur **Créer en brouillon**.
- **Fabriqué** : **Fabriquer** et sa quantité sur sa ligne ouvre un ordre de fabrication avec sa recette active, la commande suggérée et ce qu’il utilise.

Rien n’est enregistré tant que vous ne le créez pas, et ce que vous créez s’affiche aussitôt sur la ligne. Quand un article passe sous son point de commande, la vérification horaire suivante en avertit les personnes concernées dans les notifications, une seule fois jusqu’à ce que son stock remonte : ceux qui peuvent créer des commandes pour un article acheté, ceux qui peuvent planifier la production pour un article fabriqué.

> Seule une personne qui peut créer des commandes peut choisir des lignes, et seule une personne qui peut planifier la production voit **Fabriquer**.

## Les mots que vous verrez {#words}

- **Réservé** : gardé pour une vente confirmée.
- **Libre** : du stock qui peut être promis, donné en échantillon ou utilisé en production.
- **Non disponible** : un emplacement dont le stock n’est pas à expédier, comme un casier de retours à vérifier.
- **Expire bientôt** : un lot qui expire dans le nombre de jours fixé par votre organisation.
- **Périmés** : les lots dont la date de péremption est passée. Comme filtre, la liste n’affiche que ceux-là, les dates de péremption les plus anciennes d’abord, jusqu’à ce que vous le retiriez.

## Si quelque chose est refusé {#refused}

- Le stock peut aller seulement dans un emplacement sans sous-emplacement. Si l’emplacement choisi en contient, choisissez-en un à l’intérieur.
- Rien ne part d’un emplacement marqué non disponible. Déplacez d’abord le stock vers un emplacement disponible.
- Le stock réservé pour une vente confirmée ne peut pas servir à autre chose. Expédiez-le sur cette vente, ou prenez seulement ce qui est libre.
- Du stock périmé, ou remis à un ordre de fabrication, est sur la tablette mais ne réserve rien pour personne. En prendre quand une autre commande a besoin du stock utilisable est refusé, avec le nombre d’unités périmées ou remises, et un lien vers la page de l’article, où ses emplacements montrent lesquelles.
- Un code de lot imprimé sur les boîtes ne peut pas être renommé. Déplacez plutôt le stock vers le bon lot.
- Un article a un seul point de commande. Modifiez celui qu’il a : le refus y mène.
- Un point de commande et ses quantités sont supérieurs à zéro, et un maximum est supérieur au point.

Voir aussi [Mouvements](/movements), [Tracer un lot](/lots#trace), [Commandes](/orders#raise) et [Production](/production#plan).
