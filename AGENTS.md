# Git Commit Guidelines

Wszystkie commity w tym repozytorium muszą składać się **wyłącznie z jednej linijki (tytułu)** w formacie **Conventional Commits**. Nie dodawaj żadnego dłuższego opisu (body) ani stopek (footers).

## Format

```text
<typ>(zakres): <zwięzły tytuł zmiany>
```

# Menedżer pakietów

W tym repozytorium używamy wyłącznie **npm**, a nie pnpm ani Yarn.

- Zależności instalujemy i aktualizujemy przez `npm install`; do odtwarzalnej instalacji (np. w CI) używamy `npm ci`.
- Skrypty uruchamiamy przez `npm run <nazwa>`, np. `npm run dev`, `npm run build`, `npm run lint` i `npm run typecheck`.
- Jedynym lockfile jest `package-lock.json`. Commitujemy go razem ze zmianami zależności w `package.json`; nie tworzymy `pnpm-lock.yaml` ani `yarn.lock`.
