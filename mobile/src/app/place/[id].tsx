import { useLocalSearchParams } from 'expo-router';

import { samplePlace } from '@/api/mock';
import { PlaceCard } from '@/components/place-card';
import { Screen } from '@/components/screen';

// MOCK: shows sample data until step 4 loads GET /api/places/<id>/ here.
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = samplePlace(Number(id) || 1);

  return (
    <Screen>
      <PlaceCard place={place} />
    </Screen>
  );
}
