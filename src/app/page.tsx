import { Backdrop } from '@/components/backdrop';
import { CardComparison } from '@/components/card-comparison';
import { SearchForm } from '@/components/search-form';
import { cityLocative } from '@/lib/catalog';
import { getCardStatsByCity, getCityOptions } from '@/lib/data/places';

export default async function HomePage() {
  // Miasta i statystyki kart wszystkich miast – równolegle, po dwa krótkie zapytania agregujące.
  const [cityOptions, statsByCity] = await Promise.all([getCityOptions(), getCardStatsByCity()]);
  const datasets = cityOptions
    .map(({ slug, name }) => ({ slug, label: name, where: cityLocative(slug, name), stats: statsByCity[slug] }))
    .filter((d) => d.stats && d.stats.total > 0);

  return (
    <section className="relative isolate flex flex-1 flex-col">
      <Backdrop />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-8">
        <h1 className="animate-fade-up text-balance text-center text-4xl font-bold tracking-tight sm:text-6xl">
          Znajdź obiekt{' '}
          <span className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">dla swojej karty</span>
        </h1>
        <div className="relative z-20 mt-10 animate-fade-up [animation-delay:40ms]">
          <SearchForm cityOptions={cityOptions} />
        </div>
        <div className="mt-6 animate-fade-up [animation-delay:80ms]">
          <CardComparison datasets={datasets} />
        </div>
      </div>
    </section>
  );
}
