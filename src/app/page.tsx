import { Backdrop } from '@/components/backdrop';
import { SearchForm } from '@/components/search-form';
import { getCityOptions } from '@/lib/data/places';

export default async function HomePage() {
  const cityOptions = await getCityOptions();
  return (
    <section className="relative isolate flex flex-1 flex-col">
      <Backdrop />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-8">
        <h1 className="animate-fade-up text-balance text-center text-4xl font-bold tracking-tight sm:text-6xl">
          Znajdź obiekt{' '}
          <span className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">dla swojej karty</span>
        </h1>
        <div className="mt-10 animate-fade-up [animation-delay:120ms]">
          <SearchForm cityOptions={cityOptions} />
        </div>
      </div>
    </section>
  );
}
