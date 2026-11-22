import { Link } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { ScanButton } from '@/components/scan-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function SearchScreen() {
  return (
    <Screen title="Search" subtitle="Find places and people">
      <ScanButton variant="compact" />

      <EmptyState
        accent="blue"
        icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        title="Search is coming next"
        body="Look up a place by name to open its card and save it, or find friends by username."
        action={
          // Temporary: lets us test the place card route before search exists.
          <Link href={{ pathname: '/place/[id]', params: { id: '1' } }}>
            <ThemedText type="smallBold" themeColor="blue">
              Open a sample place card
            </ThemedText>
          </Link>
        }
      />
    </Screen>
  );
}
