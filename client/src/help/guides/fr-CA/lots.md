# Tracer un lot

Un lot est une quantité avec son propre code et sa date de péremption, reçue d’un fournisseur ou fabriquée par un ordre de fabrication. Tracer un lot montre où il se trouve, d’où il vient, dans quoi il a été utilisé et qui l’a reçu : la liste qu’un rappel doit joindre.

## Tracer un lot {#trace}

1. Ouvrez **Tracer un lot**.
2. Saisissez n’importe quelle partie du code de lot, du lot du fournisseur gardé à côté d’un code créé chez nous, ou d’un code que le lot a eu avant; le numéro de lot suffit généralement. Appuyez sur Entrée.
3. Choisissez le lot parmi ceux listés. Son code complet l’ouvre directement.

Vous pouvez aussi trouver un lot par son code, par le lot du fournisseur ou par un code qu’il a eu avant avec **Tout rechercher** : sa ligne donne le code de son article, puis sa date de péremption ou **Date de péremption à ajouter**, puis le lot du fournisseur ou **Lot du fournisseur à ajouter**. Vous pouvez aussi appuyer sur le code d’un lot partout où il est listé : dans l’inventaire, sous **État du stock** sur la page d’un article, et sous **En attente d’un coût** dans Valeur du stock. **Tracer le lot** sur une ligne de l’inventaire l’ouvre aussi. Un lot trouvé par un code qu’il a eu avant le dit à côté de son propre code, « ASH-0601 · anciennement ASH-06O1 », dans **Tout rechercher** et dans la liste d’ici.

## Lire une traçabilité {#read}

Sous le code du lot, le nom de son article ouvre la page de l’article, pour qui peut voir les articles, et **Tous les mouvements de ce lot** ouvre Mouvements sur son article, pour ce lot seul et toute son histoire, sans dates.

Un lot dont le code a été corrigé affiche « anciennement ASH-06O1 » à côté de son titre, et **Anciens codes**, dessous, liste chaque code qu’il a eu, du plus récent au plus ancien, avec **Utilisé jusqu’au**, **Modifié par** et **Pourquoi**. Le même « anciennement ASH-06O1 » en gris figure sous le code dans les lots de l’inventaire, dans Valeur du stock et, sur une ligne d’avant la correction, dans Mouvements. Un lot jamais corrigé n’affiche rien de tout cela.

- **Où il se trouve** : chaque emplacement qui en contient, écrit par son chemin complet depuis son entrepôt, et combien. Une personne qui ne peut pas voir les emplacements lit plutôt la quantité **Utilisable** et **Inutilisable**, sans aucun emplacement nommé. Si une partie du lot est passée dans un autre lot, **Passé ensuite à** liste chacun de ces lots, après autant de passages qu’il y en a eu, avec tout ce qu’il contient maintenant : un rappel atteint aussi ce stock.
- **D’où il vient** : sa réception et la commande du fournisseur, ou l’ordre de fabrication qui l’a produit et sa licence. Une réception sans commande dit de qui elle vient, s’il a été indiqué, et pourquoi, par exemple « Reçu sans commande : stock d’ouverture »; du stock venu d’un autre lot nomme ce lot; du stock revenu d’avant le suivi par lot indique « Revenu d’avant le suivi par lot »; et le lot créé au début du suivi par lot indique « Ce qui était en stock au début du suivi par lot ».
- **Fabriqué à partir de** : les lots de composants qu’un ordre de fabrication a utilisés, peu importe le nombre d’étapes.
- **Utilisé dans** : les ordres de fabrication qui l’ont utilisé, et les lots qu’ils ont produits.
- **Qui l’a reçu** : chaque client à qui ce lot, ou ce qui en a été fabriqué, a été expédié ou donné en échantillon, et ce qui est revenu. Une partie déplacée vers un autre lot y est suivie : qui a reçu cet autre lot figure aussi, sa colonne **Par le lot** nommant ce lot, qui ouvre sa page. Sous le code du lot, une ligne dit combien de partenaires l’ont reçu; appuyez dessus pour aller à la liste. Sur un téléphone, chacun est une carte. Un client dont la marchandise est partie avant la correction du code du lot a sa propre ligne : **Par le lot** dit « expédié sous ASH-06O1 », le code qui était sur les boîtes, et un client qui l’a reçu avant et après figure deux fois, les deux lignes s’additionnant pour donner ce qui a été expédié. Ce qui est revenu compte sous le code avec lequel ses boîtes sont parties.

Certaines unités ont pu partir sans destinataire enregistré : expédiées sans commande, ou données en échantillon sans nom. Elles figurent sans partenaire.

À côté de **Qui l’a reçu**, **Exporter** écrit la liste de rappel : les mêmes lignes, dans votre langue, le lot du fournisseur de chaque lot à côté de son code, et « (expédié sous ASH-06O1) » après un code qui a été corrigé, avec ce qui a été expédié, donné en échantillon et retourné, et le jour où le lot est parti la première fois. Ses titres et ses mots sont dans votre langue, le jour est écrit année-mois-jour, et les quantités sont écrites simplement, 600 et non 600.0000. À l’écran, une date de péremption passée dit depuis combien de temps : « Expiré depuis 4 jours ».

> Seule une personne qui peut voir les coûts voit le coût du lot et l’évolution de sa valeur. Le lot créé au début du suivi par lot contient les entrées de coût antérieures de l’article, et un coût reporté par un déplacement entre lots figure dans les deux lots, comme « Coût reporté au lot » et « Coût venu du lot ».

## Corriger le code d’un lot {#code}

Un code créé ici peut être corrigé quand il contient une faute de frappe, dans **Modifier le lot…** sur la ligne du lot dans l’inventaire, ou à côté du titre sur la page du lot. Un code imprimé sur les boîtes ne peut pas l’être : déplacez plutôt le stock vers le bon lot.

1. Changez le **Numéro de lot**. **Pourquoi le code change-t-il?** apparaît dessous. La question n’est posée que si le code diffère, et un code changé sans raison n’est pas enregistré.
2. Dites pourquoi, par exemple « 0 saisi au lieu de O à la réception ».
3. Appuyez sur **Enregistrer**. Le message nomme les deux codes, « Lot ASH-0601 enregistré. C’était ASH-06O1. », avec **Ouvrir le lot**.

L’ancien code est conservé sous **Anciens codes**, avec le jour où il a cessé d’être utilisé, qui l’a changé et pourquoi, et il retrouve le lot aussi longtemps que le lot est conservé : une boîte encore imprimée de ce code mène ici. La raison n’est pas écrite dans le journal d’activité, qui garde seulement les deux codes.

Un ancien code n’est jamais attribué à un autre lot du même article, car une boîte encore étiquetée avec lui commencerait un deuxième lot. Saisissez-en un pour un nouveau lot dans **Recevoir du stock**, dans **Recevoir** d’une commande, dans **Ajouter au compte…** ou dans **Déplacer vers un autre lot…** : le **Numéro de lot** devient rouge pendant la saisie, disant quel lot l’avait, avec un bouton **Utiliser**, qui prend ce lot et garde le reste de ce que vous avez saisi. **Enregistrer la production**, dans son **Numéro de lot**, et **Modifier le lot…** sur un autre lot le refusent sans bouton. Le lot lui-même peut reprendre son ancien code, et un autre article peut avoir le même code.

## Les mots que vous verrez {#words}

- **Code de lot ou lot du fournisseur** : le code imprimé sur la boîte ou attribué ici, ou le lot du fournisseur gardé à côté d’un code créé ici. L’un ou l’autre retrouve le lot.
- **Anciens codes** : les codes qu’un lot a eus avant la correction de son code, conservés avec la raison. N’importe lequel retrouve le lot.
- **Étapes** : combien d’ordres de fabrication séparent ce lot de l’autre.
- **Non disponible** : un emplacement dont le stock n’est pas à expédier, comme un casier de retours à vérifier.
- **Lot** : ce que produit un ordre de fabrication est aussi un lot, comme un lot reçu.

Voir aussi [Inventaire](/inventory) et [Production](/production).
