# Fonts

The fonts every document is drawn with (ADR-071), committed so that
nothing is downloaded at build or run time: documents render offline, on
any host, and in mainland China.

| File                                            | Family       | Covers                        | From                        |
| ----------------------------------------------- | ------------ | ----------------------------- | --------------------------- |
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`     | Noto Sans    | English, French               | notofonts.github.io         |
| `NotoSansSC-Regular.otf`, `NotoSansSC-Bold.otf` | Noto Sans SC | Simplified Chinese, and Latin | noto-cjk, release Sans2.004 |

Both families are under the SIL Open Font License 1.1, whose texts sit
beside them: `OFL-NotoSans.txt` and `OFL-NotoSansCJK.txt`. The licence
allows them to be bundled with software and embedded in documents.

`server/scripts/fetch-fonts.sh` fetches them and checks each against its
SHA-256 sum. It is how they arrived, and how they are replaced by a newer
release.
