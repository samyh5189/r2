import { Platform } from 'react-native';

import { SiteHeader } from './site-nav';

/** Stack `header` option: the site header with a Back button on web, the native header elsewhere. */
export const webHeaderOption = Platform.OS === 'web' ? { header: () => <SiteHeader back /> } : {};
