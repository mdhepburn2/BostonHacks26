import { EmptyState } from '@/components/empty-state';
import { ScanButton } from '@/components/scan-button';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';

export default function HomeScreen() {
  return (
    <Screen title="Home" subtitle="Explore Boston on foot">
      <ScanButton />

      <Section title="Recently saved">
        <EmptyState
          icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
          title="Save your first place"
          body="Scan something nearby or search for a place you've heard about."
        />
      </Section>

      <Section title="From friends">
        <EmptyState
          icon={{ ios: 'person.2', android: 'group', web: 'group' }}
          title="Nothing from friends yet"
          body="Add friends to see the places they're saving and visiting."
        />
      </Section>
    </Screen>
  );
}
