# Glossary

The words the app uses for its domain, fixed per language before anything
is translated (ADR-054), so one concept is one word everywhere. A
translation that disagrees with this file is wrong, even if it reads well;
change the file first, then every catalogue that uses the word.

Drafted with the French and Chinese catalogues. **Not yet reviewed by
someone fluent:** that review is a manual check before the release that
offers either language (MC-1405).

## Terms

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Product | Produit | 产品 | |
| Variant | Variante | 规格 | The thing counted: "60ct". |
| SKU | UGS | SKU | French: unité de gestion des stocks. Chinese keeps the Latin abbreviation, as labels do. |
| Lot | Lot | 批次 | A traced quantity with a code and an expiry. |
| Location | Emplacement | 库位 | A shelf, bin or site stock sits in. |
| Site / Zone / Aisle / Shelf / Bin | Site / Zone / Allée / Tablette / Casier | 站点 / 区域 / 通道 / 货架 / 货位 | A location's type by depth, outermost first. |
| Stock | Stock | 库存 | |
| Movement | Mouvement | 库存变动 | |
| Partner | Partenaire | 合作伙伴 | A customer, a supplier, or both. |
| Customer | Client | 客户 | |
| Supplier | Fournisseur | 供应商 | |
| Sales order | Commande client | 销售订单 | |
| Purchase order | Bon de commande | 采购订单 | |
| Shipment | Expédition | 发货 | |
| Packing slip | Bordereau d’expédition | 装箱单 | |
| Receipt (receiving) | Réception | 收货 | Goods arriving, not a sales receipt. |
| Invoice | Facture | 发票 | |
| Credit note | Note de crédit | 贷项通知单 | |
| Return authorization (RMA) | Autorisation de retour | 退货授权 | |
| Recipe | Recette | 配方 | A product's bill of materials. |
| Production run | Ordre de fabrication | 生产订单 | |
| Licence | Licence | 许可证 | NPN and similar product licences. |
| Price list | Liste de prix | 价目表 | |
| Tax code | Code de taxe | 税码 | |
| Organization | Organisation | 组织 | The tenant: a company using the app. |
| Sign in / Sign out | Se connecter / Se déconnecter | 登录 / 退出登录 | |
| Email (address) | Courriel | 电子邮箱 | Quebec usage. |

## Writing conventions

- **Apostrophes:** use ’ (U+2019) in translations, never '. An ASCII
  apostrophe is ICU's escape character and can swallow a placeholder.
- **French (Canada):** Quebec typography, as the Office québécois de la
  langue française recommends: no space before ? or !, a non-breaking space
  before : and inside « ». Vouvoiement throughout.
- **Simplified Chinese:** full-width punctuation (，。？：), a space between
  Chinese and a Latin word or a number only where it reads better, none
  around full-width punctuation.
- **Ellipsis:** the single character … in every language, as the English
  uses for "Saving…".
- **Placeholders:** `{name}` and tags like `<link>` are kept exactly, in
  whatever position the sentence needs; `npm run i18n:check` fails
  otherwise.
