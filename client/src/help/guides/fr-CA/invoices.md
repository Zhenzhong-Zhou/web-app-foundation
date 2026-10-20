# Factures

Une facture facture une expédition, et se crée à partir de celle-ci sur la commande. Une fois émise, elle ne change plus : une erreur s’annule par une note de crédit et se refacture. Une note de crédit rembourse tout ou partie d’une facture, et s’émet depuis celle-ci.

## Créer et émettre une facture {#issue}

1. Ouvrez la vente dans [Commandes](/orders) et, sous **Expéditions**, appuyez sur **Créer la facture** pour l’expédition. Une **Facture brouillon** s’ouvre.
2. Choisissez un **Code de taxe pour chaque ligne** et appuyez sur **Appliquer à chaque ligne**, ou **Modifier** une ligne pour lui donner son propre prix et son code de taxe.
3. Ajoutez une **Date d’échéance** et une **Note sur la facture** si vous le souhaitez, puis appuyez sur **Enregistrer les détails**.
4. Appuyez sur **Émettre**, vérifiez la **Date de facture**, et appuyez de nouveau sur **Émettre**. La facture prend son numéro et ne peut plus être modifiée.

Un brouillon que personne à l’extérieur n’a vu peut être retiré avec **Supprimer le brouillon**, et l’expédition facturée de nouveau.

> Seule une personne qui peut créer des factures voit **Créer la facture**, et seule une personne qui peut émettre des factures voit **Émettre**, **Créditer** et **Annuler**.

## Créditer une partie d’une facture {#credit}

1. Ouvrez la facture émise et appuyez sur **Créditer**.
2. Saisissez ce qui est crédité sur chaque ligne. Le prix peut être réduit, pour des frais de remise en stock ou un geste commercial, mais jamais augmenté.
3. Indiquez un **Motif**, que le client lit sur la note de crédit, et appuyez sur **Émettre la note de crédit**.

Pour une facture qui ne sera jamais payée, **Tout créditer — irrécouvrable** remplit chaque ligne en entier, avec ce motif. Toutes les notes de crédit sont listées sous **Notes de crédit**.

## Annuler une facture {#void}

Appuyez sur **Annuler**, indiquez un **Motif** et appuyez sur **Annuler la facture**. Une note de crédit l’annule entièrement, les deux restent au dossier, et l’expédition peut être facturée de nouveau. Une fois une partie de la facture créditée, créditez plutôt ce qui reste.

## Les mots que vous verrez {#words}

- **Brouillon** : pas encore envoyée, sans numéro. Elle peut encore changer.
- **Émise** : numérotée et envoyée. Elle ne change plus.
- **Annulée** : entièrement annulée par une note de crédit.

## Si quelque chose est refusé {#refused}

- L’émission demande l’adresse du siège de l’organisation, et son numéro de taxe quand la facture comporte des taxes : définissez-les sous [Organisation](/settings/organization#profile).
- L’émission demande l’adresse de facturation du client : ajoutez-en une sur sa page dans [Partenaires](/partners).
- Chaque ligne a besoin d’un code de taxe. Ajoutez des codes sous [Codes de taxe](/settings/tax-codes).
- Une expédition qui a déjà une facture n’est pas facturée deux fois. Annulez d’abord cette facture.
- Les échantillons ne se facturent pas : personne ne les paie.

Voir aussi [Retours](/return-authorizations).
