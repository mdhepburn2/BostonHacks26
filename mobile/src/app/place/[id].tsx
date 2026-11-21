import { useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

// Placeholder. Step 4 loads GET /api/places/<id>/ and shows the full card.
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen title={`Place #${id}`}>
      <EmptyState
        icon={{ ios: 'building.columns', android: 'account_balance', web: 'account_balance' }}
        title="Place card coming soon"
        body="Name, bio, rating, hours, nearest T stop and friends who want to go."
      />
    </Screen>
  );
}
