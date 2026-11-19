# Fontes, licenças e créditos

Este documento lista de onde vêm os dados, as regras e as ferramentas do projeto. Os números do white paper e do painel têm a fonte indicada aqui.

## 1. Chamadas públicas reais (conjunto de teste)

São as 8 chamadas do conjunto de teste que estão no repositório, em `ia/avaliacao/chamadas/`. O link de origem é o do índice da pesquisa, em que cada PDF foi baixado de um site oficial e conferido por amostra. Os itens são os do gabarito (`ia/avaliacao/gabarito/`), montado por um agente de IA a partir do texto dos PDFs e conferido contra eles; um agente revisor separado conferiu dois gabaritos item a item (detalhes em `ia/avaliacao/README.md`).

| Arquivo | Entidade | Município (UF) | Ano | Nº da chamada | Link de origem | Itens no gabarito |
|:--|:--|:--|:--|:--|:--|--:|
| `01-ba-estado-bahia-2026.pdf` | Secretaria da Educação do Estado da Bahia (SEC) | Órgão estadual, sede em Salvador (BA) | 2026 | Chamada Pública nº 01/2026 (centralizada) | https://www.ba.gov.br/car/sites/site-car/files/2026-01/EDITAL%20DA%20CHAMADA%20PU%CC%81BLICA%20CENTRALIZADA%20N.%2001%202026%20-%20Aquisic%CC%A7a%CC%83o%20de%20Ge%CC%82neros%20Alimenti%CC%81cios%20da%20Agricultura%20Familiar%20e%20do%20Empreendedor%20Familiar%20Rural%20-%20Publicado%20dia%2029.01.2026.pdf | 16 |
| `02-ba-iraquara-2025.pdf` | Prefeitura Municipal de Iraquara | Iraquara (BA) | 2025 | Chamada Pública nº 001/2025 (processo 0251102/2025) | https://www.iraquara.ba.gov.br/storage/files/2025/02/428-edital-de-chamada-publica-n-001-2025.pdf | 49 |
| `03-go-aparecida-de-goiania-2025.pdf` | Prefeitura Municipal de Aparecida de Goiânia (Secretaria Municipal de Educação) | Aparecida de Goiânia (GO) | 2025 | Edital de Chamada Pública nº 001/2025 | https://webio.aparecida.go.gov.br/api/lict/download/189546 | 54 |
| `04-go-catalao-2026.pdf` | Prefeitura Municipal de Catalão (Fundo Municipal de Educação) | Catalão (GO) | 2026 | Chamada Pública nº 003/2026 | https://catalao.go.gov.br/storage/documentos/a3d6a02473ccd467d9c6a250936c9dd6.pdf | 16 |
| `05-go-goiania-2026.pdf` | Prefeitura de Goiânia (Secretaria Municipal de Educação) | Goiânia (capital) (GO) | 2026 | Edital Chamada Pública nº 01/2026 | https://sme.goiania.go.gov.br/site/index.php/alimentacao-escolar/documentos-oficiais?download=1316%3Aedital-chamada-publica-n-01-2026 | 16 |
| `06-mg-santos-dumont-2025.pdf` | Prefeitura Municipal de Santos Dumont | Santos Dumont (MG) | 2025 | Chamada Pública nº 001/2025 (dispensa nº 013/2025; procedimento 032/2025) | https://www.santosdumont.mg.gov.br/arquivos/files/CHAMADA%20PUBLICA%20001%202025%20GENEROS%20ALIMENTICIOS%20AGRIC%20FAMILIAR.pdf | 24 |
| `08-pr-manfrinopolis-2026.pdf` | Prefeitura Municipal de Manfrinópolis | Manfrinópolis (PR) | 2026 | Edital de Chamamento Público / Chamada Pública nº 1/2026 (processo 4/2026) | https://manfrinopolis.pr.gov.br/wp-content/uploads/2026/01/CHAMAMENTO-PUBLICO-01-2026.pdf | 43 |
| `10-rs-sao-borja-2025.pdf` | Prefeitura Municipal de São Borja | São Borja (RS) | 2025 | Chamada Pública nº 02/2025 | https://saoborja.rs.gov.br/images/conteudo/Licitacoes/2024/CPP_02_2025.pdf | 10 |

Duas chamadas da pesquisa ficaram fora do repositório: Santarém/PA e Carnaúba dos Dantas/RN. O contrato-modelo de cada uma traz o CPF de um agente público, e o repositório não guarda CPF completo. O edital de Goiânia, que está nele, traz o CPF da secretária já mascarado pelo Diário Oficial, só com parte dos dígitos. As chamadas são atos oficiais, sem proteção de direito autoral (Lei 9.610/98, art. 8º, IV).

## 2. Dados abertos

| Fonte | O que o projeto usa | Licença e citação | Onde está |
|:--|:--|:--|:--|
| FNDE: Dados Agricultura Familiar (planilhas) | compra da agricultura familiar por entidade executora, de 2018 a 2022 (`fnde-af/`), com cópia versionada | CC BY-ND 3.0, indicada no site do FNDE; citar "FNDE" | [gov.br/fnde](https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/consultas/dados-agricultura-familiar-planilhas) |
| FNDE: PNAE, repasses, alunos e escolas atendidas, 2009 a 2026 | repasses do PNAE por entidade (`repasses/`); 2026 é parcial, com o arquivo de 08/04/2026 | CC-BY, citar "FNDE" | [dados.gov.br](https://dados.gov.br/dados/conjuntos-dados/programa-nacional-de-alimentacao-escolar-pnae) e [Plataforma Antonieta de Barros, produto 82](https://www.fnde.gov.br/plataforma-antonieta-de-barros/dados/produtos-de-dados/visualizar/82) |
| IBGE: API de localidades, municípios (nivelado) | os 5.571 municípios, com UF, região, região intermediária e imediata (`ibge/`) | uso livre, citando o IBGE | [servicodados.ibge.gov.br](https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado) |
| Dados do app e histórico simulado | exportação do app e uma cooperativa fictícia de Catalão (GO), gerada pelo próprio projeto | não se aplica | `dados/etapas/gerar_simulado.py` |

O repositório guarda só cópias sem alteração das planilhas (`dados/datalake/raw/publicos/`); as camadas trusted e refined, que o pipeline gera a partir delas, ficam fora do Git. As planilhas do FNDE são tratadas pelo pipeline (`dados/etapas/tratar.py`): a coluna de percentual da planilha não é usada, e o percentual é recalculado. Anos de 2020 a 2022 são preliminares, segundo o próprio FNDE.

## 3. Legislação e normas

| Norma | O que o projeto usa | Link |
|:--|:--|:--|
| Lei nº 11.947/2009, art. 14 (texto compilado), com a redação da Lei nº 15.226/2025 | mínimo de 45% da verba do PNAE na agricultura familiar desde 01/01/2026 (30% até 2025), compra sem licitação e prioridades | [planalto.gov.br (Lei 11.947/2009)](https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l11947.htm) e [Lei 15.226/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15226.htm) |
| Resolução CD/FNDE nº 4, de 26/02/2026 (DOU de 02/03/2026) | arts. 29 a 39: fiscalização, prazo de 20 dias, limite de R$ 40 mil por agricultor, preço, habilitação e seleção | [FNDE (PDF)](https://www.gov.br/fnde/pt-br/acesso-a-informacao/legislacao/resolucoes/2026/resolucao-cd_fnde-no-4-de-26-de-fevereiro-de-2026.pdf) |
| Resolução CD/FNDE nº 17, de 22/10/2026 (DOU de 23/10/2026) | reescreve os arts. 29 a 39 da Res. 4/2026: o RITS (prioridade de mulheres, jovens, assentados, indígenas e quilombolas) e o campo de valor previsto por agricultor | [Imprensa Nacional (DOU)](https://www.in.gov.br/web/dou/-/resolucao-cd/fnde-n-17-de-22-de-outubro-de-2026-740332518) |
| Resolução CD/FNDE nº 6, de 27/04/2026 | uso opcional do Contrata+Brasil no PNAE (contexto, sem regra no código) | [FNDE](https://www.gov.br/fnde/pt-br/acesso-a-informacao/legislacao/resolucoes/2026/resolucao-cd-fnde-no-6-de-27-de-abril-de-2026) |
| Lei nº 9.394/1996 (LDB), art. 24, I | 200 dias letivos por ano; base de `SEMANAS_PADRAO` (200 ÷ 5 = 40 semanas) | [planalto.gov.br (LDB)](https://www.planalto.gov.br/ccivil_03/leis/l9394.htm) |
| Lei nº 13.709/2018 (LGPD), art. 5º, II | origem étnica como dado pessoal sensível: por isso os critérios do RITS não vão para a IA | [planalto.gov.br (LGPD)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |

## 4. Bibliotecas e ferramentas (créditos)

| Ferramenta | Versão no projeto | Para quê |
|:--|:--|:--|
| Node.js | 24 ou mais novo | runtime do app (`http` nativo e `node:sqlite`) |
| jsonwebtoken | 9.0.3 | login com JWT (única dependência de execução do app) |
| Svelte | 5.58.0 | telas do app (desenvolvimento) |
| Vite | 8.3.8 | gera as telas em `app/public/` (desenvolvimento) |
| @sveltejs/vite-plugin-svelte | 7.3.1 | integra o Svelte ao Vite (desenvolvimento) |
| Python | 3.12 ou mais novo | IA, data lake e simulador |
| anthropic (SDK da Anthropic para Python) | 2.10 | chamadas ao Claude |
| pypdf | 7.1 | leitura do texto do PDF no modo de regras |
| pandas | 3.1 | tratamento do data lake |
| openpyxl | 3.1 | planilha `.xlsx` do painel |
| Docker e Docker Compose; Podman e podman-compose | Docker 29.9 e Compose 5.7; Podman 6.2 e podman-compose 1.6 (testados) | contêineres e teste de fumaça |
| Power BI web | serviço, sem versão fixa | painel (`dados/powerbi/guia-do-painel.md`) |
| Arduino Uno e TinkerCad | sketch em `iot/camara-fria/camara-fria.ino` | câmara fria simulada |
| Claude (Anthropic) | Claude Haiku 5.5 no produto | leitura da chamada e assistente do agricultor |

## 5. Referências do white paper

Lista completa das fontes citadas no white paper (`planejamento/white-paper/white-paper.md`), na ordem em que aparecem nele:

1. Lei nº 11.947/2009, art. 14 (texto compilado). Planalto. <https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l11947.htm>
2. Lei nº 15.226/2025, de 30/09/2025, publicada no DOU de 01/10/2025. Planalto. <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15226.htm>
3. Resolução CD/FNDE nº 4, de 26/02/2026, publicada no DOU de 02/03/2026. FNDE. <https://www.gov.br/fnde/pt-br/acesso-a-informacao/legislacao/resolucoes/2026/resolucao-cd_fnde-no-4-de-26-de-fevereiro-de-2026.pdf>
4. Resolução CD/FNDE nº 17, de 22/10/2026, publicada no DOU de 23/10/2026. Imprensa Nacional. <https://www.in.gov.br/web/dou/-/resolucao-cd/fnde-n-17-de-22-de-outubro-de-2026-740332518>
5. Resolução CD/FNDE nº 6, de 27/04/2026, publicada no DOU de 30/04/2026. FNDE. <https://www.gov.br/fnde/pt-br/acesso-a-informacao/legislacao/resolucoes/2026/resolucao-cd-fnde-no-6-de-27-de-abril-de-2026>
6. FNDE. Instrumentos operacionais da chamada pública no PNAE: modelos editáveis, abril de 2026. <https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/media-pnae/InstrumentosOperacionaisdachamadapblicanoPNAE.Modelos.COMPILADOEDITVEL.docx>
7. Portaria MDA nº 19/2025, consolidada com a Portaria MDA nº 73/2026. MDA. <https://www.gov.br/mda/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/cadastro-nacional-da-agricultura-familiar/copy2_of_PortariaMDAn19de21demarode2025Consolidada.pdf>
8. Contrata+Brasil. Tutoriais do fornecedor no PNAE: inscrição e proposta, maio de 2026. <https://www.gov.br/contratamaisbrasil/pt-br/area-do-fornecedor/aprenda_usar/pnae/tutorial-c-b-pnae-fornecedor-inscricao.pdf> e <https://www.gov.br/contratamaisbrasil/pt-br/area-do-fornecedor/aprenda_usar/pnae/tutorial-c-b-pnae-fornecedor-como-apresentar-proposta-em-uma-oportunidade.pdf>
9. Contrata+Brasil. Tutoriais do agente público no PNAE: publicação de demanda; contratação e avaliação. <https://www.gov.br/contratamaisbrasil/pt-br/area-do-agente-publico/aprenda-usar-agente-publico/pnae/tutorial-c-b-pnae-agente-publico-publicacao-de-demanda.pdf> e <https://www.gov.br/contratamaisbrasil/pt-br/area-do-agente-publico/aprenda-usar-agente-publico/pnae/tutorial-c-b-pnae-agente-publico-contratacao-e-avaliacao.pdf>
10. Central de Compras do MGI. Chamada Pública PNAE nº 01/2026, edital nacional do Contrata+Brasil. <https://www.gov.br/contratamaisbrasil/pt-br/central-de-conteudo/editais-e-regulamentacao/chamada-publica-pnae-2026/0-edital.pdf>
11. MGI. Apresentação do webinar sobre os novos serviços e a compra de alimentos pelo PNAE no Contrata+Brasil, 08/05/2026. <https://www.gov.br/contratamaisbrasil/pt-br/central-de-conteudo/eventos/o-contrata-brasil-evoluiu-novos-servicos-disponiveis-e-compra-de-alimentos-pelo-pnae/apresentacao-webinar_novos-servicos-e-pnae-no-contrata-brasil_8-5-26.pdf>
12. Fenacon. Reprodução de release do MEC (07/05/2026) sobre o início do PNAE no Contrata+Brasil, em 05/05/2026. <https://fenacon.org.br/noticias/contratabrasil-facilita-venda-de-alimentos-da-agricultura-familiar-para-escolas/>
13. Agência Gov. Lançamento da nova fase do Contrata+Brasil para compras de alimentos da agricultura familiar, 11/11/2025. <https://agenciagov.ebc.com.br/noticias/202511/governo-do-brasil-lanca-nova-fase-do-contrata-brasil-para-fortalecer-compras-publicas-de-alimentos-da-agricultura-familiar-1>
14. MGI. Apresentação executiva do Contrata+Brasil, com dados de 03/08/2026. PDF hospedado no portal da UFG (files.cercomp.ufg.br).
15. PNCP. API pública de consulta. <https://pncp.gov.br/api/consulta/swagger-ui/index.html>
16. FNDE. Relatório de Gestão Integrado 2025, p. 163. <https://www.gov.br/fnde/pt-br/acesso-a-informacao/transparencia-e-prestacao-de-contas/prestacao-de-contas-anual/2025/relatorio-de-gestao-integrado-2025-versao-anual.pdf>
17. Agência Gov. Publicada a resolução que reajusta valores do PNAE, 19/02/2026. <https://agenciagov.ebc.com.br/noticias/202602/publicada-a-resolucao-que-reajusta-valores-do-programa-nacional-de-alimentacao-escolar>
18. Consea. MonitoraSAN, março de 2026. <https://www.gov.br/secretariageral/pt-br/consea/monitorasan/20260424MONITORASANED1Marco2026.pdf>
19. Ipea. Texto para Discussão 2986. <https://repositorio.ipea.gov.br/bitstream/11058/13612/1/TD_2986_web.pdf>
20. Ipea. Boletim de Políticas Sociais 30, p. 458. <https://repositorio.ipea.gov.br/bitstream/11058/12167/98/BPS_30_NPS3_Compras_da_Agricultura.pdf>
21. IBGE. SIDRA, tabela 6778, Censo Agropecuário 2017. <https://sidra.ibge.gov.br/tabela/6778>
22. IBGE. Censo Agro 2017: agricultura familiar (infográfico). <https://biblioteca.ibge.gov.br/visualizacao/periodicos/3096/agro_2017_agricultura_familiar.pdf>
23. FNDE. Dados Agricultura Familiar: planilhas de 2015 e de 2018 a 2022. As de 2011 a 2014, 2016 e 2017 vêm de cópias do site antigo do FNDE, guardadas no Internet Archive. <https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/consultas/dados-agricultura-familiar-planilhas>
24. FNDE. Painel "Aquisição da Agricultura Familiar no PNAE – 2011 a 2022", dados preliminares. <https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/consultas/pnae-dados-da-agricultura-familiar>
25. FNDE e dados.gov.br. PNAE: Repasses, Alunos e Escolas Atendidas, 2009 a 2026, licença CC-BY. <https://dados.gov.br/dados/conjuntos-dados/programa-nacional-de-alimentacao-escolar-pnae>
26. IBGE. API de localidades: municípios. <https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado>
27. Grupo. Cálculo sobre as planilhas do FNDE de 2011 a 2022 e sobre os repasses do PNAE. Percentual nacional sobre todas as entidades; contagem de municípios e valores em reais só de prefeituras, sem as linhas com repasse zero ou valor não numérico. O pipeline do projeto refaz a conta num teste automático.
28. Anthropic. Documentação da API: suporte a PDF, visão e preços, com o custo em tokens por página e por imagem e o preço do Claude Haiku 5.5. Consultada em 18/11/2026. <https://platform.claude.com/docs/en/build-with-claude/pdf-support>, <https://platform.claude.com/docs/en/build-with-claude/vision> e <https://platform.claude.com/docs/en/about-claude/pricing>
29. FIAP. Global Solution 2026/2 – CitizenTech, edital da turma 4ESOA.
30. FIAP. Ebooks das fases 1 a 7 do curso de Engenharia de Software.
31. Lei nº 9.610/98, art. 8º, IV: atos oficiais não têm proteção de direito autoral. <https://www.planalto.gov.br/ccivil_03/leis/l9610.htm>
32. Lei nº 9.394/1996 (LDB), art. 24, I: no mínimo 200 dias de trabalho escolar por ano. <https://www.planalto.gov.br/ccivil_03/leis/l9394.htm>
33. Lei nº 13.709/2018 (LGPD), art. 5º, II: origem racial ou étnica é dado pessoal sensível. <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>
34. Lei nº 14.133/2021, arts. 6º, XLI; 17, § 2º; e 75, II, §§ 1º e 3º. <https://www2.camara.leg.br/legin/fed/lei/2021/lei-14133-1-abril-2021-791222-normaatualizada-pl.pdf>
35. Decreto nº 12.807/2025 (DOU de 30/12/2025): art. 75, II, R\$ 65.492,11 em 2026. <https://www2.camara.leg.br/legin/fed/decret/2025/decreto-12807-29-dezembro-2025-798615-anexo-pe.pdf>
36. Lei Complementar nº 182/2021, arts. 12 a 15. <https://www2.camara.leg.br/legin/fed/leicom/2021/leicomplementar-182-1-junho-2021-791408-publicacaooriginal-162919-pl.html>
