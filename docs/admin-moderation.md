# Moderacja zgłoszeń

Link „Panel administratora” w stopce prowadzi do `/admin`. Osoba bez aktywnego
konta administratora trafia do `/admin/login`. Logowanie odbywa się przez
Supabase Auth (e-mail i hasło), bez formularza rejestracji w aplikacji.

## Uruchomienie

1. Uruchom `npm run db:migrate` dla docelowego środowiska przed wdrożeniem kodu.
   Migracja `0002_contribution_moderation` dodaje dwie tabele i enum; nie zmienia
   dotychczasowych informacji o kartach.
2. W `.env.local` i w konfiguracji odpowiedniego środowiska Vercel ustaw
   `NEXT_PUBLIC_SUPABASE_URL` oraz `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Skopiuj je z Supabase → Connect. Muszą należeć do tego samego projektu co
   `DATABASE_URL`. Użyj klucza publishable, nigdy `service_role` ani secret key.
   Po zmianie zmiennych Vercel potrzebny jest nowy build/deployment.
3. W Supabase Auth włącz dostawcę Email. Jeśli konta mają być wyłącznie
   administracyjne, wyłącz „Allow new users to sign up”.
4. W Authentication → Users utwórz konto administratora z adresem e-mail
   i silnym hasłem; potwierdź adres. Hasło zapisuje wyłącznie Supabase Auth.
5. Skopiuj UUID utworzonego użytkownika i w SQL Editor wykonaj:

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID-UZYTKOWNIKA-Z-AUTH')
   on conflict (user_id) do update set is_active = true;
   ```

6. Otwórz `/admin`, zaloguj się i sprawdź kolejkę. Nie przekazuj hasła przez Git
   ani czat. Kolejni administratorzy otrzymują własne konta.

Odebranie dostępu (historia decyzji zostaje):

```sql
update public.admin_users
set is_active = false
where user_id = 'UUID-UZYTKOWNIKA-Z-AUTH';
```

## Przepływ danych i uprawnienia

- Formularz publiczny zapisuje wyłącznie `card_contributions` z domyślnym
  statusem `pending`. Nie aktualizuje `places`, `place_card_claims` ani cache.
- Panel pokazuje aktualne dane obok propozycji, link do źródła i notatkę do
  decyzji. Kolejka i historia mają stronicowanie po 20 zgłoszeń.
- Zatwierdzenie w jednej transakcji aktualizuje informację o karcie, datę
  obiektu oraz decyzję. Dopiero wtedy unieważnia publiczny cache.
- Odrzucenie zapisuje tylko decyzję. Historia zachowuje identyfikator
  administratora, datę, notatkę i poprzednie wartości informacji o karcie.
- Blokady wierszy chronią przed powtórną decyzją; porównanie daty obiektu
  wymusza ponowne sprawdzenie, gdy dane zmieniły się po otwarciu panelu.
- Tożsamość jest weryfikowana przez `auth.getUser()`, a uprawnienia przez
  chronioną tabelę `admin_users`. Kontrola występuje na stronie i w akcji
  serwerowej, dodatkowo w transakcji decyzji. Nie opiera się na ukryciu linku.
- Middleware odświeża cookies tylko pod `/admin`. Panel nie jest indeksowany
  i nie trafia do współdzielonego cache.
- Nowe tabele mają włączone RLS bez publicznych polityk. Dostęp przez Drizzle
  wymaga zaufanego serwerowego połączenia jak dotychczas. Nie nadawaj `anon`
  ani `authenticated` polityk umożliwiających zarządzanie administratorami.
- Starsze zgłoszenia, które zostały już opublikowane przed migracją, pozostają
  w danych publicznych; nie da się odtworzyć ich poprzednich wartości.

## Weryfikacja

`npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Test integracyjny na skonfigurowanej bazie, po migracji (PowerShell):

```powershell
$env:MODERATION_INTEGRATION_TEST = '1'
npm run test
Remove-Item Env:MODERATION_INTEGRATION_TEST
```

Test tworzy osobne dane w transakcji i wycofuje wszystkie zapisy. Sprawdza
izolację zgłoszeń, odrzucenie, zatwierdzenie, historię, brak uprawnień,
wycofanie uprawnień, powtórną decyzję, konflikt danych i RLS dla `anon`.
Nie tworzy kont Supabase Auth; logowanie rzeczywistym kontem należy sprawdzić
po konfiguracji Auth.
