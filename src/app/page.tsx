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
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        <div className="mb-7 max-w-3xl animate-fade-up">
          <h1 className="text-balance text-3xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
            Znajdź obiekt <span className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">dla swojej karty</span>
          </h1>
        </div>
        <div className="relative z-20 animate-fade-up [animation-delay:40ms]">
          <SearchForm cityOptions={cityOptions} />
        </div>
        <div className="mt-8 animate-fade-up [animation-delay:80ms]">
          <CardComparison datasets={datasets} />
        </div>
      </div>
    </section>
  );
}
