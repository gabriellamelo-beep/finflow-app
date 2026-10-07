# FinFlow — app do celular

App pessoal (PWA) de controle financeiro: lançamentos rápidos, faturas de cartão com parcelas, orçamento por categoria, recorrentes, fluxo de caixa, investimentos, metas e patrimônio.

- HTML/CSS/JS puro, sem build. Abra `index.html` por um servidor http (ex.: `python -m http.server`).
- Os dados ficam só no navegador do aparelho (localStorage, chave `finflow.v1`). Nada é enviado para servidores.
- Para trazer os dados do FinFlow do computador: **Configurações → Levar dados para o app do celular** no PC e **Ajustes → Importar arquivo do PC** no celular.
- Use **Ajustes → Exportar backup** com frequência.
- Ao publicar uma nova versão, altere `VERSION` em `sw.js` para o app atualizar no celular.
