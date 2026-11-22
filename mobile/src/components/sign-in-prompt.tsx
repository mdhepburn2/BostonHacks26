import { router } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { type Accent } from '@/constants/theme';

type SignInPromptProps = {
  title: string;
  body: string;
  icon?: SymbolViewProps['name'];
  accent?: Accent;
};

/** Empty state for things that need an account, with a button to the login screen. */
export function SignInPrompt({
  title,
  body,
  icon = { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  accent = 'tint',
}: SignInPromptProps) {
  return (
    <EmptyState
      accent={accent}
      icon={icon}
      title={title}
      body={body}
      action={<Button label="Log in" onPress={() => router.push('/login')} />}
    />
  );
}
