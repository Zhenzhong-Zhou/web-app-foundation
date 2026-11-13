# Inventaire

L’inventaire montre ce que vous avez et où : chaque article, à chaque emplacement, par lot. D’ici, vous recevez le stock arrivé sans commande, vous le déplacez et vous corrigez un compte de stock. Son second onglet, **Points de commande**, indique quels articles commencent à manquer.

## Recevoir du stock {#receive}

1. Appuyez sur **Recevoir du stock**.
2. Choisissez l’article, et l’emplacement où il va, sous **Vers**. Seuls les emplacements qui contiennent directement du stock sont proposés.
3. Saisissez la quantité, dans l’unité de l’article.
4. Pour un article suivi par lot, saisissez le numéro de lot et la date de péremption tels qu’imprimés sur la boîte. Chaque nouvelle réception du même lot augmente sa quantité.
5. Appuyez sur **Recevoir**.

Les marchandises envoyées par un fournisseur pour un achat sont plutôt reçues sur la commande, dans [Commandes](/orders). Le stock reçu ici n’a pas de coût tant qu’un coût n’est pas défini dans [Valeur du stock](/costs); il figure alors sous **En attente d’un coût**.

## Déplacer, sortir du stock ou corriger {#move}

Les actions de chaque ligne proposent :

- **Déplacer** : vers un autre emplacement, comme du quai vers une tablette.
- **Sortie de stock** : du stock qui part sans commande. Les marchandises d’un client partent de sa vente, dans Commandes.
- **Envoyer un échantillon** : un don, avec la personne à qui il a été remis, pour qu’un rappel puisse le retrouver.
- **Corriger le compte** : combien la tablette contient de plus ou de moins que ce qui est enregistré, pourquoi, et ce qui s’est passé.
- **Modifier le lot**, **Tracer le lot** et **Historique** : le lot de la ligne, où il est allé, et ses mouvements.

> Seule une personne qui peut déplacer du stock voit **Recevoir du stock** et les actions de chaque ligne, et seule une personne qui peut corriger les comptes voit **Corriger le compte**.

## Promis aux clients {#promised}

Dès qu’une vente confirmée réserve du stock ou en attend, ce tableau montre, pour chaque article, le stock en main là d’où il peut partir, ce qui est réservé, ce qui est libre et ce qui est en rupture. Le stock réservé va d’abord à la vente confirmée la plus ancienne.

## Points de commande {#reorder-points}

Un point de commande est le niveau sous lequel un article commence à manquer : en dessous de ce niveau, l’article est indiqué comme ayant un stock bas ici, sur l’accueil et dans les notifications, avec ce qu’il faut commander. Un article sans point de commande n’est jamais considéré comme ayant un stock bas.

1. Dans **Points de commande**, appuyez sur **Ajouter un point de commande**, ou choisissez **Point de commande…** dans les actions d’une ligne de **Stock**.
2. Choisissez l’article, et s’il est **Acheté** ou **Fabriqué**. Fabriqué est choisi pour vous quand l’article a une recette active.
3. Saisissez le **Point de commande**, dans l’unité de l’article, et choisissez combien commander.
4. **Aujourd’hui** montre où en est l’article maintenant et après la commande suggérée. Appuyez sur **Ajouter un point de commande**, ou sur **Enregistrer** pour une modification.

Les actions de chaque ligne proposent **Modifier le point de commande**, **Stock de l’article** et **Retirer le point de commande**. Retirer un point de commande ne change ni le stock ni les commandes de l’article. Un article abandonné garde son point de commande, mais n’est jamais considéré comme ayant un stock bas.

> Toute personne qui peut voir le stock voit la liste. Seule une personne qui peut définir les points de commande voit **Ajouter un point de commande**, **Point de commande…** et les actions de chaque ligne : au départ, le propriétaire seul, jusqu’à ce qu’un rôle le permette.

## Où en est un article {#position}

La **Position** d’un article = utilisable + à venir − encore requis : le stock aux emplacements marqués disponibles, moins les lots périmés et ce qui a été remis aux ordres de fabrication; plus les bons de commande confirmés qui restent à recevoir et la production des ordres lancés qui reste à venir; moins les commandes clients confirmées qui restent à expédier. Ainsi, un bon de commande déjà créé ne déclenche pas une nouvelle commande.

Un article est **Bas** sous son point, **Épuisé** à zéro ou moins, et **Suffisant** autrement. Les articles les plus loin sous leur point apparaissent en premier, et **Stock bas** montre aussi les épuisés. Ouvrez une ligne pour voir ce qui compose sa position et quelles commandes sont en retard.

## Combien commander {#how-much}

- **Juste assez** : le manque, pour revenir au point.
- **Quantité fixe** : par multiples entiers, comme un fournisseur vend par caisses. S’il manque 1 500 unités et que les commandes se font par 1 000, cette règle suggère 2 × 1 000.
- **Jusqu’à un maximum** : remplit jusqu’à un niveau au-dessus du point.

Les bons de commande et les ordres de fabrication en brouillon s’affichent **En brouillon**. Ils ne comptent pas comme à venir, puisqu’un brouillon peut ne jamais partir, mais leurs quantités sont déduites de la **Commande suggérée**. Si les brouillons couvrent le manque d’un article dont le stock est bas, celui-ci indique **Brouillon fait**, pour éviter une deuxième commande.

## Commander ou fabriquer les articles dont le stock est bas {#order}

- **Acheté** : choisissez les lignes, puis appuyez sur **Créer un bon de commande** dans la barre qui apparaît. Un nouveau bon de commande s’ouvre avec une ligne par article, pour la quantité suggérée. Choisissez le fournisseur sous **Partenaire**, vérifiez les quantités et les prix, et appuyez sur **Créer en brouillon**.
- **Fabriqué** : **Planifier un ordre** sur sa ligne ouvre un ordre de fabrication avec sa recette active, la commande suggérée et ce qu’il utilise.

Rien n’est enregistré tant que vous ne le créez pas, et ce que vous créez s’affiche aussitôt sur la ligne. Quand un article passe sous son point de commande, la vérification horaire suivante en avertit les personnes concernées dans les notifications, une seule fois jusqu’à ce que son stock remonte : ceux qui peuvent créer des commandes pour un article acheté, ceux qui peuvent planifier la production pour un article fabriqué.

> Seule une personne qui peut créer des commandes peut choisir des lignes, et seule une personne qui peut planifier la production voit **Planifier un ordre**.

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
- Un code de lot imprimé sur les boîtes ne peut pas être renommé. Déplacez plutôt le stock vers le bon lot.
- Un article a un seul point de commande. Modifiez celui qu’il a : le refus y mène.
- Un point de commande et ses quantités sont supérieurs à zéro, et un maximum est supérieur au point.

Voir aussi [Mouvements](/movements), [Tracer un lot](/lots#trace), [Commandes](/orders#raise) et [Production](/production#plan).
