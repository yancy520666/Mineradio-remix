# Repository history preservation audit — 2026-10-10

## Execution update — 2026-10-10 08:14 UTC

The user approved the bounded five-tag adjustment. Remote execution is **blocked**, not completed. A full non-shallow mirror containing all 35 expected refs was created; its 9.2 MiB bundle passed verification, restoration into an independent repository, full fsck and exact 35-ref comparison. Bundle SHA-256: `22ac0a137e2bca6dc3121408de6f4edd77e195b52366876103144ee2378ea9eb`.

Five candidate tags were prepared in a separate local repository. New annotated tag objects are `bca9a699f66ceea9808c8a1b9ee477db14660410` (v2.2.1) and `3ad0959ab5cc92b0be456707e0a2109c72dd986a` (v2.2.2); annotations and tagger bytes are preserved. The three lightweight tags use the proposed new commit SHAs below. The full script was tested against a separate local-only remote: atomic lease update and verification passed, with exactly five tags changed. This local test did not touch GitHub.

The real GitHub push dry run exited 128: `fatal: could not read Username for 'https://github.com': terminal prompts disabled`. No existing cloud Git push identity was available. No credentials were created, no new grants requested, and no remote updates attempted after that blocker. The available connector ref-write tool supports branches rather than tags, so it is not an equivalent authorized tag-push path.

The deliverable package contains the complete Git bundle, release metadata, before/restored ref manifests, verification logs, exact old/new tag plan, audit evidence and `retarget-five-tags.py`. It does not include release binaries or the live uncommitted feature-repair working tree. The active working tree and its refs were untouched. The original plan and evidence below describe the read-only audit snapshot; pending-approval statements there are superseded by this update.

## Original audit status and recommendation

**Approval is pending. This audit did not rewrite commits, create backup bundles, move tags, delete refs, or change anything on GitHub.** This report and its JSON evidence are documentation only.

The requested outcome is to reset inherited upstream history while retaining as much history as possible from the user's first changes. The current main branch already satisfies that history boundary. Rewriting it again would add disruption without an evidenced benefit. The smallest proposed change is to retarget five stale version tags to already-existing clean commits whose complete file trees are identical.

Snapshot: GitHub API observations made on 2026-10-10 between 08:01 and 08:03 UTC. Re-read the refs before execution; these values are evidence, not permission or a guarantee that the remote remains unchanged.

## Verified history boundary

- Current remote main: `735b30dbfaa715c46b9dfb36e2b941ac8d2c0086`.
- Main has 273 commits, with every parent present in the collected graph. Authors: yancy520666 233; Claude 33; Codex 7. No XxHuberrr author or co-author occurs in that graph.
- The original first user modification is `acf48b0cb4a6d1931f670d68b804fbe205f34df6`, dated 2026-09-29 15:03:04 UTC, “修复后台唤醒后的窗口与播放恢复”. Its parent was upstream `d43de565acabfdc1a9c9820a27e81a98ccbebcef`.
- The existing clean counterpart is root `beeb7836ba539c86a5bb7a9cc10c8cc15611b035`, with identical tree `787af231379ac423c9527162eac728058e35d742`.
- Main also includes independent snapshot root `345dbb2a25885657ae6bcb39a9704dc460dce9be`, dated 2026-09-29 20:17:05 UTC. Its message explicitly says “Initialize Mineradio Remix from original project” and preserves original credits and GPL-3.0.
- The repository API reports `fork=false`.
- `upstream-history` is misleadingly named: its 14 commits are all user commits already reachable from main. Do not delete it based on its name.
- `claude/project-thread-xhg4be` contains two additional commits, `93054b89afd02c02eb0cb7b5b570dacd96904db1` and `b63a958ffc12cb642c14b6a7d017e9c8f772df95`. Preserve them.
- These conclusions use parent graphs, exact tree and metadata comparisons, and explicit initialization messages, not merely author-name inference.

## Proposed five-tag mapping and tree proofs

The old ref-object SHA is the value required for an explicit compare-and-swap lease. For annotated tags it differs from the peeled commit SHA.

### v2.2.1
- Ref: `refs/tags/v2.2.1`; type: annotated tag.
- Expected old ref-object SHA: `d0b91aeace381ba7ddbc2ff7fbe2c86b34d5ca05`.
- Old peeled commit: [`4526541e7a73b40cc0d372b48488f144dae5afe0`](https://github.com/yancy520666/Mineradio-remix/commit/4526541e7a73b40cc0d372b48488f144dae5afe0).
- Proposed new commit: [`621d3a848e0f8f7b4ab344c9bd4b281f7f43133c`](https://github.com/yancy520666/Mineradio-remix/commit/621d3a848e0f8f7b4ab344c9bd4b281f7f43133c).
- Old tree: `39f36cabd902e85b4345239c4347ee25ab186c03`.
- New tree: `39f36cabd902e85b4345239c4347ee25ab186c03`.
- Result: complete Git tree equality verified.
- Original tagger: yancy520666 <263844655+yancy520666@users.noreply.github.com>, 2026-09-29T19:51:53Z; tag message: "Mineradio Remix v2.2.1 release candidate\n". A new annotated tag object is needed; preserve this public metadata and annotation. Do not silently convert to lightweight or fabricate a signature. Its new object SHA cannot be specified until that object is created.

### v2.2.2
- Ref: `refs/tags/v2.2.2`; type: annotated tag.
- Expected old ref-object SHA: `5614f1eef9a5ddce0f8a5bb47d22c9517e90ab68`.
- Old peeled commit: [`e15a2ac506d84ae344c799147f9f8eef78df655b`](https://github.com/yancy520666/Mineradio-remix/commit/e15a2ac506d84ae344c799147f9f8eef78df655b).
- Proposed new commit: [`2bd94edc81a830748205b079057528249bbc221b`](https://github.com/yancy520666/Mineradio-remix/commit/2bd94edc81a830748205b079057528249bbc221b).
- Old tree: `bfed97296a51f1aecb6b6132b6ed2d90f76a715f`.
- New tree: `bfed97296a51f1aecb6b6132b6ed2d90f76a715f`.
- Result: complete Git tree equality verified.
- Original tagger: yancy520666 <263844655+yancy520666@users.noreply.github.com>, 2026-09-29T20:08:25Z; tag message: "Mineradio Remix v2.2.2 release candidate\n". A new annotated tag object is needed; preserve this public metadata and annotation. Do not silently convert to lightweight or fabricate a signature. Its new object SHA cannot be specified until that object is created.

### v2.4.0
- Ref: `refs/tags/v2.4.0`; type: lightweight tag.
- Expected old ref-object SHA: `39b436cebc5d4b2ecceb29e997b9d71834e11acf`.
- Old peeled commit: [`39b436cebc5d4b2ecceb29e997b9d71834e11acf`](https://github.com/yancy520666/Mineradio-remix/commit/39b436cebc5d4b2ecceb29e997b9d71834e11acf).
- Proposed new commit: [`2d0ea59f2c1b4043953f5444e59781966c81b77e`](https://github.com/yancy520666/Mineradio-remix/commit/2d0ea59f2c1b4043953f5444e59781966c81b77e).
- Old tree: `87736345c229e6c0ef1547fc52169c2212acec62`.
- New tree: `87736345c229e6c0ef1547fc52169c2212acec62`.
- Result: complete Git tree equality verified.

### v2.4.1
- Ref: `refs/tags/v2.4.1`; type: lightweight tag.
- Expected old ref-object SHA: `600235c73a584dea665c9369bd950ffb08b1aada`.
- Old peeled commit: [`600235c73a584dea665c9369bd950ffb08b1aada`](https://github.com/yancy520666/Mineradio-remix/commit/600235c73a584dea665c9369bd950ffb08b1aada).
- Proposed new commit: [`ea4bdeff26842de49eeefac5b3b4c28d175bc63e`](https://github.com/yancy520666/Mineradio-remix/commit/ea4bdeff26842de49eeefac5b3b4c28d175bc63e).
- Old tree: `72360060139be3ec97b12dcc0ae7045892764195`.
- New tree: `72360060139be3ec97b12dcc0ae7045892764195`.
- Result: complete Git tree equality verified.

### v2.4.2
- Ref: `refs/tags/v2.4.2`; type: lightweight tag.
- Expected old ref-object SHA: `0d840c106d7fc4495dfd02574db68bb51ec25693`.
- Old peeled commit: [`0d840c106d7fc4495dfd02574db68bb51ec25693`](https://github.com/yancy520666/Mineradio-remix/commit/0d840c106d7fc4495dfd02574db68bb51ec25693).
- Proposed new commit: [`1b5ce6a25f1065cce0f491e52215c3a2344521c0`](https://github.com/yancy520666/Mineradio-remix/commit/1b5ce6a25f1065cce0f491e52215c3a2344521c0).
- Old tree: `3e2c7ff8bfe88ad4931bf685fb94f8f38c9fa3d3`.
- New tree: `3e2c7ff8bfe88ad4931bf685fb94f8f38c9fa3d3`.
- Result: complete Git tree equality verified.

## Retention counts and scope

The 35 observed refs comprise three branch heads, nine tags, and 23 GitHub PR head refs.

Across writable branch heads and tags, the current graph has 400 distinct commits. The proposed mapping preserves 275 distinct clean commits: main's 273 plus the two independent guide-branch commits.

Exactly 125 old SHA objects cease to be reachable from these writable refs: 66 upstream-author commits and 59 historical user/AI SHA duplicates. Every one of the 59 duplicates already has a clean counterpart with the same tree, complete commit message, author name, author email, and author timestamp. Thus this proposal discards no verified post-takeover change. Committer fields and cryptographic signatures were not used as equality claims.

This is **not** a claim that 125 commits will be permanently erased from GitHub. Old PR refs retain old objects. For example, `refs/pull/1/head` points to `4f06d1901dbfc5a2f293e347168e8944919d93a6` and reaches all 66 original-author commits. GitHub's read-only PR refs cannot be deleted by ordinary force push.

Unaffected tags: v2.2.3, v2.2.4, v2.3.0, v2.3.1. Main and all branch heads remain unchanged.

Published releases v2.4.0, v2.4.1, and v2.4.2 have `immutable=false` in the observed API response. Do not delete or re-upload their installer assets. Retargeting changes the commit identity used for source archives despite identical source trees. Their existing release metadata contains the old commit in `target_commitish`; preserve the evidence and verify the resulting release/tag behavior rather than silently expanding scope to release edits.

## Exact duplicate mappings

The evidence JSON contains full author metadata and full messages. Each row below passed all five equality checks described above.

| Old SHA | Existing clean SHA | Identical tree SHA |
|---|---|---|
| `0d840c106d7fc4495dfd02574db68bb51ec25693` | `1b5ce6a25f1065cce0f491e52215c3a2344521c0` | `3e2c7ff8bfe88ad4931bf685fb94f8f38c9fa3d3` |
| `4146fd01009f8c9905b68962ad977884dad3c4b9` | `5fff58f90f847fa10725217df6cca8e3fba9a510` | `6fc33313940f82b21a74b6fb5730efc66794d294` |
| `e0b9561b019aee80fe0bfc5d94fb8d2c991126b5` | `48e8a2d9629baba72819809c964e07650c2a4cbe` | `811cb9039c78f38c5d0ea92e47d9ad0940b520d4` |
| `b915035c81b488a5b813b5fea69e85820c46b0fb` | `29ae36e51eac4445136b52e7529202ca1fd8f293` | `b56c0a8f4df53a788324fe1505115724f3011b9c` |
| `4b01d6a9e86ff4367c06a3ca4635a8394244952e` | `db2c490e028c8ffa2adf383fc0e3dd70c3bbc5cd` | `04f16e5439adbba9067bee750ee67fc7bf9ca783` |
| `43f3ada2d15f760d787b3915b8b73e68cbd35b31` | `9680b5ff0712f113430a001aa5e802d717654dcb` | `451e3cf3b3fc037ec7df1ca1f81cbb8b8654eb68` |
| `fd147b7ac13945fa094317ff3f195b0ab7ca0262` | `83b2ab4baab3032641a1d066af39d076e6545922` | `35b79069f307888884fd54fa9579bcc97c52a83f` |
| `25cb5b7d98661d79d77df853ce76dac83953c436` | `848078c0e4fe5b94e6e75802c4bd70021d52b1aa` | `2dced8289bf828e2a9550b4a0c92af5d7d409bc7` |
| `239102a21939f7e9f2334b8152ecf1430d30ab14` | `00c3a3fe23de3996dc805732b6ac6df3978e5262` | `ff071d6cfd4e3a7058cc2ba13ed79a59817f1fad` |
| `de3700bad68576cd2a1f7720c267bb6c768535a2` | `324b90385bfaacab13739cf602a80850ea50119e` | `234d604d8ccb32987935c978994f1734051e6cb7` |
| `4ca40c8f1930b186c76f8e6f20ca3830d38d20bb` | `ecc1bc3a8efe5e44d956af56dd4beea5538450d1` | `e1bbaa2d0251c83a62f1a7deb7a2da01c5ef44df` |
| `aad8ffc4fc6e43b81d30908b522b2a3023c0ed19` | `59d7b9608ae18a6cbe6f8e697c972eb41f77e084` | `7d64f9253aae0fa740ffba8dc769a724561b2e03` |
| `600235c73a584dea665c9369bd950ffb08b1aada` | `ea4bdeff26842de49eeefac5b3b4c28d175bc63e` | `72360060139be3ec97b12dcc0ae7045892764195` |
| `03f65792390c340bb0b78bf02bccb4f8efabab10` | `d138f937ca29e0aaee92e170b85c262a133e71cb` | `40d3db11b68f1448f6f4b6cbbd312f1607d6c5d7` |
| `ae54de6be68f8a9ef22e4ebbfdb0f0cd53fd3caf` | `fc10bee4551bea1535245c524eb995fbd21dca9b` | `d886213ddd7bcb7339579da9446eff7342751846` |
| `8e7e742f9cdde6625a32acf0fd3cda8bbcb66db7` | `c07a21513e2ed498d638c3d6a7a8cda5993d1486` | `67b301eccfd04c70b0b78074950b3fb00f6d4530` |
| `aa29b4132e5cb017254366471cfd05c752d09b95` | `bac53f8f717527fe89e00d56c8049e1a5ccd7ec8` | `cc6fc86d2e742841c38661ab269544b69ed3ef56` |
| `bb21c9d14104859aae8def7da5e89d74d473f691` | `e1514141f417484ff1745b8fd57315dc00b60a3f` | `553c24d6e689a446b591a92986bf7cc4e57446b3` |
| `9d697893e6a7e5b00d15cf54ae2734117eb2143a` | `af4c878f5aa1860899d1b5426de627213ac48231` | `c5aad4bf814384d5c7acbe3c0d02c77305eddd3c` |
| `abe9c73cbd0f845a2e3551ba6fca355e9dbb00d4` | `31d6c87fc26d0c1ac1ecfcae34a41c1fa66a9d17` | `74d7f5bd95ab0a71d126a384e9eadf862caa6d4b` |
| `7cefc408e82f1972a35db8ccdba5c85b9c2bd719` | `bc7c53e6c063fb6d09fe75b59ccb5e0825130de5` | `22b514293a631867d6ebfa969661982fa5c0f1da` |
| `5ba4b238b5064a424227f58e03c894994bdd40b1` | `dab67ea0a51902d49a37c3bc443c36536e8203a0` | `9451963d5effa32167613baf559d7ff336b16482` |
| `6fc9de592481894f413023167b5baa68c13b8f5d` | `cdcb44cf89f67598c252d4677628e1939aea2e20` | `e936a4e162def3b7c21850c284d011b068135d52` |
| `e77ec0e560b8fd8b44dd48e6dfd3343ad71a3e97` | `e5a9cb73da9f5fd27588d9c4ced1671d47c501b4` | `fea5058ec467b4ee5cc45636629fc956230e4b3e` |
| `48436854491f279506e252b23a13c5132ce9e89c` | `57b7399060e212c07fd2cd025062e96b3fcc7520` | `072bb5ce25c7c3449cf690c14ea7f44745e53412` |
| `8d72e1c6211d7ecddad1bbf9c036ece32bfcc074` | `d174f6e208883567bda4cd7e86bb331f4e5fd096` | `dcec4b9eed99e21ce825c69ebf8c5f934d1a306a` |
| `8933b98d0df8530ec9eb6bcd25636d26923abb45` | `6972282fe25639ffe8ed285559abfb69dd25bbac` | `05cc25cb803eaf8b70a8a01c647cf040c21dc44d` |
| `bdd9e1febe585be1e5de8dbde57a8ae533001461` | `51996d1cec89418d39b2f4103381b6169fcc6c8f` | `21ebddb28a40cca91c6913e2eb19fdb527a9f795` |
| `bcb8ab2275168449aa1ea01226218466a93684ef` | `7c85dfd44c53818d042ffae929d1a0b3c304aca0` | `b04a708af02d37a698c44a9aa6ce015920a0652c` |
| `f623c6949f35dda5a34a43869205fe7013901680` | `20e965d74c95f0937f5353e85a242a04bfafddf0` | `c1519f26c14ac27fe6164f454048a6fbf259047d` |
| `c440c796e8448c9b321f3698e2dac3d1ea17e21b` | `9d6e7619405fa82969c978d58bea70b6efd2744f` | `bba6bc1ff01811f590ea30116563698445e943a1` |
| `45dc63faa336b87c8ac902ff40d5eb65a39dc10c` | `9637782f50eeb635c6b8a8c22f7d0712e40017ac` | `b261353b537ac6d28b7236157bb414281848bd28` |
| `a4b655c5c91a290da03878ecdca7dee7479c06ef` | `7d5f6a4875c8e39859c8c4a4b78bae1b5e3c5968` | `28c96a0c87e1fd49d260ecb61b10065573a080bb` |
| `7444771e82dfe7fba080a7f006b9f2d05feb4a7d` | `f528270789c332b35376d8614726a5024489cc94` | `3faa522f52848d7334bdc1f70e63b79092e59559` |
| `5d01c535711ad3bdd862f8bf5778f856aa336e47` | `6d23a56a1008d57fb3be1fcecdc40b1df841235f` | `6de7525feb29e241d92f67501cfe7aea976a26f3` |
| `b4df520ea3dff10296bbbdc88940f2e6815711ac` | `8fdfb5e19e2a874fa02fbef6692b57d373b35940` | `2ad4226ccaa2e40f7f1329289589318befbe54c2` |
| `345c4ba3373cc74e443768543534bd9adaceb7f0` | `3c6fba7b725d583ac92d804e2d918b86d80780df` | `5d7e80cbd93ee2d286462bf960321a9974c6bf54` |
| `a2b590ca923b08aa266d56aed3f3276016182dc5` | `97696a3915ea6467d63e3067f51917e193c99a9a` | `60e067783b44f1fa171e6c8b4c6a610e16a0a4cd` |
| `8ecbebae61c81474d5e3f3d4a702112fd5de9440` | `3fc6f9c1a3b549d5d68714d0fe3abd00d013fce2` | `8bfe2b7ca08d92340cb1bc23f690776ab4afe40a` |
| `87814234c76b1ac961ad8084555487132a971720` | `359c32ecaed03e788fd2811090e4105ee3b40cd7` | `9188ff2429dd43c41c9ff30f0457494f2b84c674` |
| `dfb2c779f74744bc8caa4aab037ffdba51bf6863` | `821221403c59fadd6d4e018d96b3b66afda46a8b` | `b95c9b0674cdbd110da8cb7974214ed2f137b99c` |
| `39b436cebc5d4b2ecceb29e997b9d71834e11acf` | `2d0ea59f2c1b4043953f5444e59781966c81b77e` | `87736345c229e6c0ef1547fc52169c2212acec62` |
| `7db7d47edf9dca9611c2d942c53e956968ad37d8` | `f3358fa11520a2bbe41cfcef9c4d966c765fc4f6` | `a1ba61fccf6d220cdad5555485b63b0ad8d1cebe` |
| `0b4c16496c85659d0c409b8c8b585218a3b9a10b` | `8985eca6194c7621d8107aed99cd8031de0c2a1c` | `a1ba61fccf6d220cdad5555485b63b0ad8d1cebe` |
| `e15a2ac506d84ae344c799147f9f8eef78df655b` | `2bd94edc81a830748205b079057528249bbc221b` | `bfed97296a51f1aecb6b6132b6ed2d90f76a715f` |
| `66d2243fb7a6bd289cf22fea842d76aaa52b824f` | `f4833131bffe114af889f473488e12b74b70ab4f` | `bfed97296a51f1aecb6b6132b6ed2d90f76a715f` |
| `4526541e7a73b40cc0d372b48488f144dae5afe0` | `621d3a848e0f8f7b4ab344c9bd4b281f7f43133c` | `39f36cabd902e85b4345239c4347ee25ab186c03` |
| `00db321ac244f1fbec99aad5bdd9778867fc1559` | `7cb5745b8f11613a1149d76d981bc24489473e77` | `39f36cabd902e85b4345239c4347ee25ab186c03` |
| `0da09cb3690414a86d9eb86ffb6c42082dacc7a3` | `b9c046e5f7989b93984486c67253dcbf3963c87b` | `e2cf3321dbf40241cbe649e70ee0149ec5851819` |
| `1d0a791b9541570d0fb02f3005f079ba6724f3bb` | `18cbe5f759f840003722374bae719993591cbf96` | `6c4354ce9b1f792631b943ca497aebb6fa7c9f8b` |
| `5decc49961599934ec5d34d12fba1ae2bc50df0d` | `e5ac6c131c233b4115b249cd6c5360ab05e11d48` | `6840c9b40c16975c67d247d4a3d518bbcac161d8` |
| `7473c3c9c65059d8795adece1f7090d22129b2be` | `c905e639b3847c5a3b94b2c5e25595efe30965bf` | `537a0c144a8fc23996a1463d8275dd0cf0dc7a17` |
| `036afac3930aae635cba045fb35a6b2fb195c8d2` | `ecb937ec65f49078708d9250c2b1fc9137e74769` | `537a0c144a8fc23996a1463d8275dd0cf0dc7a17` |
| `4bd7c3b7d0f7635bb0eb9eb6f0b9c56f6e39176c` | `8cf0c449e7a9d0fe27f411e6e07a72bb274cc3e5` | `0eb83274490fb964c0579b6f95ac3703c2ecd950` |
| `0b6b2b7d025c26f29d58f30dccf3b7a2fd671dcd` | `24755ff8cc7f5cdd2c9280edc91fefaea1164a9a` | `0eb83274490fb964c0579b6f95ac3703c2ecd950` |
| `74088e2b8801f345f12c2270a17bd8f1484806e2` | `3ccf12a391587363bf837fad96e590c17bb89379` | `cd73e090d367a2d92d5f01c4bbf187a0de8cfe0c` |
| `945ff64f27fcd2e59fd81177d2b932275fe045e2` | `d4234488d141cc3be243cf905b8fe84ff8e523b4` | `9c89f2111affbb787f66c39ba6ab6077ba29e1ff` |
| `4f06d1901dbfc5a2f293e347168e8944919d93a6` | `345dddda50012f40db403d6290ecc8330e83cc8e` | `9c89f2111affbb787f66c39ba6ab6077ba29e1ff` |
| `acf48b0cb4a6d1931f670d68b804fbe205f34df6` | `beeb7836ba539c86a5bb7a9cc10c8cc15611b035` | `787af231379ac423c9527162eac728058e35d742` |

## Backup prerequisites — not yet performed

1. Preserve current work independently. The active local working tree contains uncommitted feature and repair work and eight delivered commits beyond remote main: `3c6715d` through `d4a4200`. Do not reset, stash, rebase, or clean that active tree for this operation. Back up its Git objects, index/staged state, relevant tracked/untracked source files, and exact status, excluding credentials and reproducible dependencies such as node_modules.
2. Both inspected local clones are shallow. Neither can support a claim of complete remote-history backup. Use a separate full object repository through an authorized, functioning access route. If that route is blocked, stop and report the blocker; do not bypass it.
3. Capture all branch/tag refs and the observed PR refs into a dedicated backup repository, with explicit names. Preserve annotated tag objects, the old graph, and Release metadata. Verify that the source repository is not shallow and that all reachable objects are present.
4. Create a full `git bundle create <backup-path> --all` from that independent complete repository; record a SHA-256 checksum and ref manifest. Run `git bundle verify`, then restore into a new isolated directory and run object/connectivity checks. Verify the restored old ref-object SHAs, tag peeled targets, and representative trees against this report. A bundle does not contain working-tree changes, LFS payloads, release assets, issues, or PR discussion metadata; do not describe it as an entire GitHub account/release backup.
5. Keep the verified backup outside the working repository and do not publish a backup branch or tag back into this repository, which would preserve the unwanted reachable history. Ensure the backup survives environment loss through an authorized persisted artifact route before remote modification.
6. Do not claim any of these backup steps have already succeeded. Approval for the proposed remote modification remains pending.

## Authorized execution design after approval

- Re-read all five expected old ref-object SHAs, main, and other refs. On any mismatch, stop and reconcile rather than overwriting concurrent work.
- Work in the isolated repository. Reuse the existing clean commits. Create two replacement annotated tag objects for v2.2.1 and v2.2.2 with the original annotations and tagger metadata; preserve evidence of their old objects. For the three lightweight tags, the new ref values are the proposed commit SHAs.
- Do not rewrite main, replay user commits, change copyright notices, edit LICENSE/NOTICE, delete tags, alter branch protections, or modify release assets as a side effect.
- Prefer one atomic push containing exactly the five explicit tag refspecs, with an explicit `--force-with-lease=refs/tags/<tag>:<old-ref-object-SHA>` for every tag and `--atomic`. Inspect the prepared command and manifest before sending. Never use `--mirror`, `--all`, an unqualified `--force`, or blanket `--tags`.
- A dry run is an extra validation step, not a substitute for exact leases. If the server does not support atomic updates or policy blocks tag replacement, stop and request the required decision. Do not silently fall back to five unguarded sequential writes or relax protection.
- New annotated-tag object SHAs must be recorded after creation. Read back all five refs, peel them, compare their trees, and confirm all unaffected refs remain unchanged before saying the operation succeeded.
- Rollback, if authorized and necessary, must likewise be explicit and guarded by the actual post-change ref values; restore original annotated tag objects, not merely old peeled commits.

## Contributors display and remaining limits

GitHub documents that contributor displays/statistics can take about 24 hours to refresh after force-pushing, rewriting history, or deleting commits. The current contributors UI was not directly verified by this audit. Cache staleness is a possible explanation, not a proven diagnosis. The documented contributor graph is based on the default branch; the presence of stale tags does not by itself prove the cause of a stale display.

Do not promise that tag cleanup immediately removes a displayed contributor. GitHub may retain objects through PR refs, cached views, clones, or other repositories. GitHub's sensitive-data removal procedure is not a promise that Support will erase ordinary attribution/history; its documentation explicitly limits non-sensitive removals.

## Sources and reproducibility

- [Current main commit](https://github.com/yancy520666/Mineradio-remix/commit/735b30dbfaa715c46b9dfb36e2b941ac8d2c0086)
- [Original first user change](https://github.com/yancy520666/Mineradio-remix/commit/acf48b0cb4a6d1931f670d68b804fbe205f34df6)
- [Clean first user change](https://github.com/yancy520666/Mineradio-remix/commit/beeb7836ba539c86a5bb7a9cc10c8cc15611b035)
- [Independent Remix snapshot](https://github.com/yancy520666/Mineradio-remix/commit/345dbb2a25885657ae6bcb39a9704dc460dce9be)
- [Git refs API, 100-item page](https://api.github.com/repos/yancy520666/Mineradio-remix/git/refs?per_page=100)
- [Commits API, main, page 1](https://api.github.com/repos/yancy520666/Mineradio-remix/commits?sha=main&per_page=100&page=1): pages 1–3 returned 100, 100, and 73 commits.
- Tag histories were retrieved with the same commits endpoint and sha set to the relevant tag. Counts: v2.2.1 78; v2.2.2 80; v2.4.0 207; v2.4.1 236; v2.4.2 248.
- [Releases API](https://api.github.com/repos/yancy520666/Mineradio-remix/releases?per_page=100)
- [GitHub contributor statistics and refresh guidance](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors)
- [GitHub history-rewrite side effects and read-only PR refs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- Machine-readable captured evidence: [history-preservation-evidence-2026-10-10.json](history-preservation-evidence-2026-10-10.json). This includes the observed 35-ref manifest, 273-commit main graph, all 59 duplicate proofs, 66 upstream commit IDs, and tag-object details.

The connector's generic /tags and /contributors resource routes rejected the endpoint shape. No denied authentication or fetch operation was retried. Tag evidence above was gathered through supported Git-data refs/tag-object endpoints; contributor-display state remains unverified.

