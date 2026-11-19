# Conexão com o curso

Esta é a seção "Conexão com o curso" do white paper do grupo, copiada aqui para o repositório ficar completo: ela mostra de qual capítulo do curso vem cada tecnologia do projeto.

O edital pede usar o conteúdo até a fase 7, e tecnologia fora dele não pontua (edital da turma 4ESOA). Por isso, cada escolha técnica tem um capítulo de base, e o plano técnico liga cada uma das 18 tarefas a um capítulo e a um item da entrega. Foi esse mapa que levou ao módulo `http` nativo do Node (o curso não ensina Express) e à IA em Python. A exceção, escolha do grupo, são as telas em Svelte com Vite, fora do conteúdo do curso. O Claude aparece na F4C07, seção 4.6 ("Claude: foco em segurança, alinhamento e comportamento controlado"), e na F1C08 (IA generativa, Anthropic). O uso segue o padrão que a F7C07 ensina com `from openai import OpenAI`: um cliente de LLM em Python manda o pedido e recebe a resposta. No projeto, esse cliente é o SDK da Anthropic, que o curso não ensina. Por isso o modo de regras, em Python com `pypdf`, funciona sem o Claude.

| Fase | Capítulos usados e para quê |
|:-----|:-----------------------------------------------------------------------|
| 1 | **F1C01** medir para decidir, na avaliação da IA; **F1C03** big data; **F1C06** e **F1C07** mentalidade de startup e oportunidade; **F1C08** IA generativa e a Anthropic; **F1C09** lógica nas regras de casamento e agrupamento; **F1C10** IoT; **F1C11** hiperautomação e ambiente Python. |
| 2 | **F2C04** integração de dados e ETL; **F2C07** eletrônica do circuito; **F2C09** Python, pandas, openpyxl e automação; **F2C11** cultura DevOps e Git. |
| 3 | **F3C06** validar o problema; **F3C07** engenharia de prompt; **F3C08** álgebra de Boole no alerta da câmara fria; **F3C09** Arduino e TinkerCad; **F3C10** HTTP, REST e JWT. |
| 4 | **F4C03**, **F4C04** e **F4C05** Spark, Kafka e NiFi no caminho de produção; **F4C06** Canvas; **F4C07** modelos de base e o Claude (seção 4.6); **F4C09** segurança em IoT; **F4C11** Docker e Docker Compose. |
| 5 | **F5C01** automação cognitiva; **F5C03** data lake; **F5C04** ingestão; **F5C06** modelos de negócio e assinatura; **F5C07** entrada multimodal (PDF); **F5C08** linguagem C; **F5C09** modelos e segurança em IoT; **F5C10** SQLite; **F5C11** Jenkins. |
| 6 | **F6C03** visualização; **F6C04** DAX e contexto de filtro; **F6C05** protótipo; **F6C06** MVP; **F6C07** agentes e guardrails; **F6C09** TinkerCad; **F6C10** IA na leitura de documentos; **F6C11** segurança no DevOps e tokens. |
| 7 | **F7C01** orquestração; **F7C03** e **F7C04** DAX com variáveis e funções lógicas; **F7C05** financeiro; **F7C06** pitch; **F7C07** `pypdf` e cliente de LLM em Python (`from openai import OpenAI`); **F7C08** Arduino; **F7C10** app Node com `http` nativo, Docker, SonarQube e Trivy; **F7C11** Jenkins e monitoramento. |
