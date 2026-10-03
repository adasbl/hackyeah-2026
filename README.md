# hackyeah-2026
chat goes brrr...

## Frontend – uruchomienie

Wymagania: Node.js 20.9+ i pnpm (`corepack enable` albo `npm i -g pnpm`).

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm build
```

Na razie dane pochodzą z mocka (`src/mocks/places.ts`). Format odpowiedzi API do uzgodnienia: [`docs/api-contract.md`](docs/api-contract.md).

| Ścieżka | Co to jest |
|---|---|
| `/` | ekran wyszukiwania (miasto, karta, kategoria) |
| `/warszawa?cards=multisport&category=basen` | wyniki – linkowalne, renderowane na serwerze |
| `/polska` | wyniki dla całej Polski |
| `/places/[slug]` | szczegóły obiektu ze statusami kart |
