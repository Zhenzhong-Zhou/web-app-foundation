# Mouvements

Les mouvements sont toutes les variations de quantité, de la plus récente à la plus ancienne : réceptions, expéditions, transferts, corrections, production et retours. Ils ne sont jamais modifiés ni supprimés; une erreur se corrige par un autre mouvement.

## Trouver un mouvement {#find}

1. Tapez dans **Trouver un article, un lot ou une commande** un code, un nom ou un numéro, puis choisissez parmi ce qu’il propose, groupé en Articles, Lots et Commandes, « Lot VC-0302 · Vitamine C 500 mg · périme le 22 nov. 2026 » ou « PO-000009 · Lakeshore Packaging · Reçue en partie ». Un lot se trouve par son code ou par le lot du fournisseur, que son choix nomme. Ce qui correspond exactement vient seul, un code de lot entier comme MCS-001, ou un lot du fournisseur entier, ce lot seul; seulement quand rien ne correspond, ce qui s’en approche, pour une faute de frappe, sous **Résultats proches**. Un article montre les mouvements de ce code, un lot ceux de son article pour ce lot seul, et une commande ce qui a bougé pour elle. Les flèches déplacent, Entrée choisit, Échap ferme. Ce que vous tapez seul ne filtre rien; chaque choix est une puce au-dessus de la liste. Laissez vide pour lire tous les mouvements.
2. Limitez la liste par **Emplacement**, par **Motif** et par les jours sous **Quand**, un seul menu : **Aujourd’hui**, **Cette semaine**, **Ce mois-ci**, **Les 30 derniers jours**, **Le mois dernier** ou **Cette année**, chacun avec ses jours à côté, une période qui comprend aujourd’hui se terminant aujourd’hui et une semaine commençant le lundi; ou **Choisir les dates…**, qui ouvre **Du** et **Au**, à taper ou à choisir, avec **Effacer** et **Appliquer**, pour un jour de début, un jour de fin, ou les deux. Les deux jours sont compris, selon les jours de votre organisation; laissez Du vide pour partir du début, Au vide pour aller jusqu’à aujourd’hui. **Quand** et une puce au-dessus de la liste montrent les jours choisis, comme « 1–20 nov. 2026 », l’année une seule fois quand c’est la même, un début seul « À partir du 1 nov. 2026 », une fin seule « Jusqu’au 15 nov. 2026 »; des jours sans mouvement le disent, avec **Afficher tous les mouvements**; **N’importe quand**, au pied du menu, ou le × de la puce les retire. Échap ferme le menu.
3. Appuyez sur **Afficher 25 de plus** pour voir les lignes plus anciennes. Si les 25 suivants ne peuvent pas être chargés, les lignes restent, avec **Réessayer**.

Appuyez sur **Quand**, en tête de la première colonne, pour mettre les plus anciens d’abord, et encore pour les plus récents. Chaque filtre est dans l’adresse : un rechargement, un lien et Retour les conservent; **Afficher tous les mouvements** les retire tous.

Chaque ligne dit quand; le nom de l’article, avec son code et son type dessous, et « anciennement VITC-90 » lorsque le code a changé depuis; la variation, avec son unité; le motif; de → à, chaque emplacement par son chemin, une extrémité hors de l’entrepôt dite en gris : fournisseur, client, fabrication, échantillon, compté en plus ou compté en moins; le lot avec sa date de péremption; le document concerné, un lien vers la commande ou l’ordre de fabrication, ou vers le partenaire à qui un échantillon est allé; et qui l’a fait. Sous 600 px, chaque mouvement est une carte, et les filtres et le tri sont derrière un seul bouton **Filtres**.

## Lire un code comme une fiche de stock {#card}

Avec un seul article choisi, **Entrée** et **Sortie** remplacent la variation, et **Solde** dit ce qu’il y avait en main après chaque ligne, calculé à rebours à partir du stock en main d’aujourd’hui.

- Sur tous les emplacements, un déplacement entre deux emplacements du code n’est ni une Entrée ni une Sortie, de sorte que le solde tient : sa ligne dit une fois, sur les deux colonnes, en gris, combien a été déplacé, comme « déplacé 20 unités, ni en entrée ni en sortie », et les entrées et sorties de la période ne le comptent pas. Avec plusieurs articles, la variation se lit « déplacé 20 unités ». Avec un **Emplacement** choisi, les chiffres ne comptent que cet emplacement, et une ligne le dit; avec un lot choisi, que ce lot, et avec un emplacement aussi, ce lot à cet endroit.
- Avec des jours choisis, une ligne au-dessus de la liste donne l’ouverture, **Entrée**, **Sortie** et la clôture pour ces jours : la clôture est l’ouverture plus les entrées moins les sorties, et pour des jours qui finissent aujourd’hui, ou plus tard, c’est le stock en main d’aujourd’hui, daté d’aujourd’hui. Plusieurs articles n’ont pas cette ligne, leurs unités différant.
- Avec un **Motif** choisi, **Solde** disparaît, puisqu’il compte tous les motifs : « Le solde compte tous les motifs. Effacez Motif pour le voir. » Entrée et Sortie restent.
- Avec plusieurs articles listés à un emplacement, une ligne vous invite à choisir un article pour voir Entrée, Sortie et Solde. Les mouvements d’une commande montrent Entrée et Sortie, jamais Solde : avec une commande choisie, cette ligne n’apparaît pas.

## Où mène un lien {#links}

Mouvements s’ouvre déjà restreint depuis d’autres écrans, et **Retour** vous ramène là où vous étiez, tel que vous l’aviez laissé.

- Dans [Inventaire](/inventory), **Actions** › **Mouvements** d’un article ouvre ce code, **Mouvements** d’un emplacement ce code à cet endroit, et **Actions** › **Mouvements** d’un lot ce lot et toute son histoire, sans dates, comme **Tous les mouvements de ce lot** sur sa traçabilité.
- Sur la page d’un article, chaque code sous **État du stock** a ses **Derniers mouvements**, les cinq plus récents, qui se terminent par **Tous les mouvements de** ce code, qui s’ouvre sur ce mois-ci, le solde d’ouverture, les entrées, les sorties et le solde de clôture au-dessus de la liste.
- Les **Réceptions** d’un achat et les **Expéditions** d’une vente se terminent par **Tous les mouvements de** et le numéro de la commande.

Chaque filtre choisi apparaît en puce au-dessus de la liste, sur un téléphone aussi : l’article, marqué « (abandonné) » quand il ne sert plus, l’emplacement, le motif, les jours, et un lot ou une commande qu’un lien nomme, comme « Lot : VC-0302 » ou « Commande : PO-000009 »; appuyez sur le × d’une puce pour retirer ce filtre seul, par exemple pour passer des mouvements d’un lot à ceux de son emplacement. Les mouvements d’une commande sont ce qui a été reçu, expédié et retourné sur elle.

## Exporter la liste {#export}

Appuyez sur **Exporter** pour télécharger les mouvements que montrent vos filtres, dans un fichier CSV que vous pourrez ouvrir dans un tableur. Il a les colonnes de l’écran, une valeur dans chacune, du plus ancien au plus récent, puis le code sous lequel un mouvement a été enregistré s’il a changé depuis, une colonne Code du motif après Motif avec le code du motif, comme receipt ou shipment, le même dans toutes les langues pour qu’on puisse réunir des exportations faites en deux langues, le courriel de la personne qui l’a fait, et la note en dernier. À côté de Lot, Lot du fournisseur donne le lot du fournisseur d’un code créé ici, ou Lot du fournisseur à ajouter tant qu’il n’est pas donné, et Date de péremption indique Date de péremption à ajouter quand elle n’est pas encore connue. **Quand** donne le jour et l’heure à l’horloge de votre organisation, le jour écrit année-mois-jour, et son en-tête nomme le lieu, comme dans « Quand (fuseau horaire : Vancouver) ». Avec un article choisi, une colonne Déplacé entre Sortie et Solde donne combien un déplacement compté ni en entrée ni en sortie a déplacé; avec des jours choisis aussi, sa première ligne est le solde d’ouverture et sa dernière le solde de clôture, avec les entrées et les sorties de la période.

## Corriger une erreur {#correct}

Un mouvement ne peut pas être modifié. Pour rétablir une quantité, utilisez **Corriger le compte** ou **Déplacer** dans [Inventaire](/inventory). Chacun ajoute son propre mouvement, pour que l’historique dise ce qui s’est passé et qui l’a fait.

> Qui ne peut pas voir les emplacements n’a ni la liste **Emplacement** ni la colonne **De → à**, et un lien qui nomme un emplacement lit **Partout**; son export n’a ni De ni À. Qui ne peut pas voir les commandes ne voit aucune commande sous **Document**, ni un ordre de fabrication sans la permission de voir la production, ni le partenaire d’un échantillon sans la permission de voir les partenaires, et un lien qui nomme une commande liste tous les mouvements, sans puce. Qui ne peut pas voir le stock ne voit pas Mouvements du tout.

## Les mots que vous verrez {#words}

- **Reçu** : du stock qui arrive, sur une commande ou sans commande.
- **Expédié** : du stock qui part, pour un client ou sans commande.
- **Déplacé** : du stock passé d’un emplacement à un autre.
- **Corrigé** : un compte rectifié, ou du stock trouvé là où il n’avait jamais été, sa cause à la suite, comme dans « Corrigé : trouvé ».
- **Fabriqué** et **Utilisé en fabrication** : ce qu’un ordre de fabrication a produit, et ce qu’il a utilisé.
- **Envoyé en échantillon** : du stock donné.
- **Retourné** : du stock renvoyé par un client.
- **Utilisateur supprimé** : une personne dont le compte a été supprimé. Ses mouvements restent.

Voir aussi [Inventaire](/inventory) et [Tracer un lot](/lots).
