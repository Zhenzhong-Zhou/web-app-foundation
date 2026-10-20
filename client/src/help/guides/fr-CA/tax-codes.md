# Codes de taxe

Chaque ligne de facture porte un code de taxe, qui dit quelle taxe elle perçoit. Un code peut percevoir deux taxes sur le même montant, comme la TPS et la TVQ ensemble; un code qui ne perçoit rien est exonéré.

## Ajouter un code de taxe {#add}

1. Appuyez sur **Ajouter un code de taxe**.
2. Donnez-lui un **Nom**, tel que la ligne de facture l’affichera : TPS, TPS + TVQ, Exonéré.
3. Sous **Taxes perçues**, appuyez sur **Ajouter une taxe** pour chaque taxe, avec son nom et son **Taux %**. N’en mettez aucune pour un code qui ne perçoit rien.
4. Appuyez sur **Enregistrer**.

Ajoutez les taxes que vous percevez, et un code Exonéré pour les articles que vous ne taxez pas : aucune facture n’est émise tant que chacune de ses lignes n’a pas de code.

## Modifier ou retirer un code {#change}

1. Sur la ligne du code, appuyez sur **Modifier**.
2. Changez un taux, ou décochez **En usage** pour retirer le code.
3. Appuyez sur **Enregistrer**.

Un nouveau taux s’applique aux factures émises ensuite; celles déjà émises gardent le taux de leur émission. Un code retiré reste sur les factures qui l’ont utilisé, et n’est plus proposé pour les nouvelles lignes.

> Seule une personne qui peut ajouter des codes de taxe voit **Ajouter un code de taxe**, et seule une personne qui peut les modifier voit **Modifier**.

## Les mots que vous verrez {#words}

- **En usage** : proposé sur les nouvelles lignes de facture.
- **Retiré** : conservé sur les factures passées, proposé sur aucune nouvelle.
- **Exonéré** : un code qui ne perçoit rien.

## Si quelque chose est refusé {#refused}

- Un code de taxe de ce nom existe déjà. Choisissez un autre nom, ou modifiez celui qui existe.
- Une taxe figure deux fois. Un code perçoit chaque taxe une seule fois.
- Un taux est un pourcentage entre 0 et 100.
- Une ligne de facture n’a pas de code de taxe. Choisissez-en un, ou Exonéré, sur la facture.

Voir aussi [Factures](/invoices).
