export type LanguageCode = 'SK' | 'EN' | 'DE' | 'DEV';

export type ConnectorStatus =
  | 'available'
  | 'EVconnected'
  | 'connectEV'
  | 'cennectEV'
  | 'preparing'
  | 'charging'
  | 'suspendedEV'
  | 'suspendedEVSE'
  | 'suspended'
  | 'finishing'
  | 'faultedWithTransa'
  | 'faultedWithoutTransa'
  | 'faulted';

type Messages = Record<string, string>;

const KEY_PREFIX = 'TP.';

function withTpPrefix(messages: Messages): Messages {
  const out: Messages = {};
  for (const [key, value] of Object.entries(messages)) {
    out[`${KEY_PREFIX}${key}`] = value;
  }
  return out;
}

function toTpKey(key: string): string {
  return key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
}

const rawSk: Messages = {
  'header.provider': 'Majiteľ',
  'header.networkOnline': 'Online',
  'header.networkOffline': 'Offline',
  'station.title': 'Stanica',
  'station.deviceId': 'Device ID',
  'actions.info': 'Info',
  'actions.support': 'Podpora',
  'actions.language': 'Jazyk',
  'language.overlayTitle': 'Zmena jazyka',
  'language.pick': 'Vyberte jazyk rozhrania:',
  'language.name.SK': 'Slovenčina',
  'language.name.EN': 'English',
  'language.name.DE': 'Deutsch',
  'language.name.DEV': 'DEV (kľúče)',
  'support.overlayTitle': 'Podpora',
  'support.intro': 'Potrebujete pomoc s nabíjaním?',
  'support.lead': 'Ak sa nabíjanie nespustilo alebo sa prerušilo, kontaktujte nás. Pri urgentnom probléme volajte. Pre fakturáciu a podrobnejší opis problému použite e-mail.',
  'support.phoneCardTitle': 'Zavolať helpdesk',
  'support.phoneCardHint': 'Najrýchlejšia pomoc',
  'support.emailCardTitle': 'Napísať e-mail',
  'support.emailCardHint': 'Pre neurgentné problémy',
  'support.mailPrepTitle': 'Do e-mailu uveďte',
  'support.mailPrepOwner': 'Majiteľa stanice',
  'support.mailPrepStation': 'Názov a označenie stanice',
  'support.mailPrepConnector': 'Konektor',
  'support.mailPrepTime': 'Dátum a čas problému',
  'support.whereTitle': 'Kde tieto údaje nájdete',
  'support.whereOwner': 'Majiteľ stanice je hore vľavo.',
  'support.whereStation': 'Názov a označenie stanice nájdete v riadku stanice.',
  'support.whereConnector': 'Konektor je veľký názov pri danom konektore.',
  'support.callbackHint': 'Ak sa nedovoláte, zavoláme vám naspäť.',
  'support.appsHint': 'Pre pohodlné sledovanie nabíjania alebo vytvorenie účtu môžete použiť:',
  'support.androidApp': 'Android app',
  'support.appleApp': 'Apple app',
  'support.webApp': 'Web App',
  'support.showQr': 'QR',
  'support.qrTitle': 'QR kód',
  'support.qrHint': 'Naskenujte telefónom pre rýchlu akciu.',
  'qr.pay.title': 'Možnosti platby (ČSOB GP WebPay)',
  'qr.pay.googlePay': 'Google Pay',
  'qr.pay.applePay': 'Apple Pay',
  'qr.pay.fastPay': 'Fast Pay',
  'qr.pay.cards': 'Visa / Mastercard',
  'info.overlayTitle': 'Info',
  'info.reader.title': 'Pomoc a návody',
  'info.reader.back': 'Späť',
  'info.reader.current': 'Aktuálna téma',
  'info.reader.topicList': 'Zoznam tém',
  'info.reader.listTitle': 'Vyberte tému',
  'info.reader.listHint': 'Ťuknutím otvoríte konkrétny návod.',
  'info.reader.context': 'Návrat',
  'info.reader.section.howto': 'Ako postupovať',
  'info.reader.section.important': 'Dôležité',
  'info.reader.section.locate': 'Kde to nájdete',
  'info.reader.section.next': 'Čo nasleduje',
  'info.reader.important.default': 'Po autorizácii pripojte vozidlo do 5 minút, inak sa pokus zruší.',
  'info.reader.next.none': 'Toto je posledná téma.',
  'info.page.info-1.intro':
    'Základná orientácia na kiosku: stanica, konektory a bezpečné správanie pri obsluhe verejného nabíjania.',
  'info.page.info-1.howto':
    '1. V riadku stanice vidíte lokalitu a označenie zariadenia.\n2. Konektory sú na kartách, stav je vždy čitateľný.\n3. Podrobnosti a cenník otvoríte cez označené bloky s akčným pásom.',
  'info.page.info-1.important':
    'Kiosk je určený na krátku obsluhu. Po dokončení krokov sa vráťte vozidlo nechať bezpečne zaparkované mimo chodníka.',
  'info.page.info-1.locate': 'Názov stanice a Device ID sú v hornom riadku stanice. Konektor je veľký názov na karte.',
  'info.page.info-2.intro':
    'Keď je konektor voľný alebo máte pripojené vozidlo, nabíjanie spúšťate ako registrovaný používateľ cez kartu alebo aplikáciu.',
  'info.page.info-2.howto':
    '1. Zvoľte správny konektor podľa parkovacieho miesta.\n2. Pripojte kábel k vozidlu.\n3. Priložte RFID kartu alebo potvrďte štart v aplikácii podľa pokynov na displeji.',
  'info.page.info-2.important':
    'Pri súkromných konektoroch bez voľného prístupu musí byť používateľ autorizovaný, inak štart nie je možný.',
  'info.page.info-2.locate': 'Stav „Voľný“ alebo „Vozidlo pripojené“ je na prvej karte konektora na domovskej obrazovke.',
  'info.page.info-3.intro':
    'Po spustení štartu prebieha príprava a komunikácia medzi stanicou a vozidlom pred začatím skutočného nabíjania.',
  'info.page.info-3.howto':
    '1. Sledujte odpočet alebo stav prípravy na karte.\n2. Neprepájajte kábel, kým stanica nedá súhlas.\n3. Po prechode do nabíjania sledujte výkon a energiu v spodnej časti karty.',
  'info.page.info-3.important':
    'Ak sa nabíjanie nespustí do stanoveného času, transakcia sa môže zrušiť. Zopakujte postup alebo kontaktujte podporu.',
  'info.page.info-3.locate': 'Indikátory prípravy a čas sú v strede karty konektora počas stavu prípravy alebo pripájania.',
  'info.page.info-4.intro':
    'Počas aktívneho nabíjania sledujte priebeh na displeji. Tento režim platí, keď ešte nie je na kiosku zobrazené prihlásenie používateľa.',
  'info.page.info-4.howto':
    '1. Sledujte výkon a odber energie v spodnom bloku karty.\n2. Nechajte kábel pripojený až do ukončenia.\n3. Ukončenie vykonáte cez aplikáciu, kartu alebo podľa pokynov operátora.',
  'info.page.info-4.important':
    'Bez overenia používateľa môžu byť niektoré akcie obmedzené podľa pravidiel stanice.',
  'info.page.info-4.locate': 'Časy a výkon sú v strede a spodnej časti karty počas stavu nabíjania.',
  'info.page.info-5.intro':
    'Keď ste overení a na displeji je prihlásený používateľ, máte plný prístup k akciám pri prebiehajúcom nabíjaní.',
  'info.page.info-5.howto':
    '1. Overte sa čipom alebo kódom podľa výzvy.\n2. Sledujte stav transakcie a energiu v spodnom bloku.\n3. Ukončenie vykonáte cez ponuku session alebo aplikáciu.',
  'info.page.info-5.important':
    'Po odchode z detailu konektora na prehľad stanice sa relácia na kiosku resetuje a vyžaduje nové overenie.',
  'info.page.info-5.locate': 'Údaje o session a akcie nájdete v detaile konektora a v časti session po overení.',
  'info.page.info-6.intro':
    'Nabíjanie bolo ukončené alebo pozastavené vozidlom. Skontrolujte stav a prípadne odpojte kábel až po potvrdení.',
  'info.page.info-6.howto':
    '1. Prečítajte si stav na karte (napr. ukončené vozidlom).\n2. Skontrolujte súhrn energie v spodnom bloku.\n3. Ak je všetko v poriadku, bezpečne odpojte kábel a uvoľnite miesto.',
  'info.page.info-6.important':
    'Ak sa stav nezhoduje s tým, čo vidíte na vozidle, použite Podpora a uveďte čas a označenie konektora.',
  'info.page.info-6.locate': 'Spotreba v kWh je v spodnom bloku karty. Časy sú v strede karty pri tomto stave.',
  'info.page.info-7.intro':
    'Stavica pozastavila nabíjanie (blokované stanicou). Príčina môže byť sieťová, tepelná alebo prevádzková.',
  'info.page.info-7.howto':
    '1. Nepokúšajte sa nasilu opakovať štart bez pokynu.\n2. Skontrolujte hlásenia na karte a na vozidle.\n3. Ak problém pretrváva, kontaktujte podporu a uveďte Device ID stanice.',
  'info.page.info-7.important':
    'Opakované pokusy bez odborníka môžu stanicu ponechať v chybovom režime dlhšie.',
  'info.page.info-7.locate': 'Device ID je v pravom hornom rohu riadku stanice. Konektor je označený na karte.',
  'info.page.info-8.intro':
    'Stavica hlási chybu. Podľa typu chyby môže alebo nemusí prebiehať transakcia. Postupujte opatrne.',
  'info.page.info-8.howto':
    '1. Prečítajte si stručný popis stavu na karte.\n2. Nepokračujte v nabíjaní, ak to systém neumožňuje.\n3. Použite Podpora a pripravte si fotografiu obrazovky alebo presný čas.',
  'info.page.info-8.important':
    'Pri chybe s transakciou môže byť potrebné overenie používateľa pred ďalšou akciou.',
  'info.page.info-8.locate': 'Označenie stanice a konektora nájdete v hornom riadku stanice a na karte konektora.',
  'info.pager.counter': 'Návod',
  'info.pager.of': 'z',
  'info.pager.prev': 'Predchádzajúci',
  'info.pager.next': 'Ďalší',
  'info.pager.pred': 'Pred:',
  'info.pager.akt': 'Akt:',
  'info.pager.nasl': 'Nasl:',
  'pricing.overlayTitle': 'Cenník',
  'access.overlayTitle': 'Prístup konektora',
  'connector.stavLabel': 'Stav konektora',
  'connector.maxPower': 'Max výkon',
  'connector.priceFrom': 'Cena od',
  'connector.price': 'Cena',
  'connector.currentPower': 'Aktuálny výkon',
  'connector.energy': 'Nabitá energia',
  'connector.public': 'Public',
  'connector.private': 'Private',
  'connector.onlyRegistered': 'len pre registrovaných',
  'connector.accessPricing': 'Prístup a cenník',
  'connector.qrPay': 'QR to pay',
  'connector.moreInfo': 'Viac',
  'connector.tapHint': 'Ťuknite pre detail',
  'connector.plugType.type2Outlet': 'Type 2 zásuvka',
  'pricing.hint': 'Toto je cenník bloku konektora, nie globálne Info.',
  'pricing.kwh': 'Cena za kWh:',
  'pricing.session': 'Jednotková cena:',
  'pricing.parking': 'Parkovanie:',
  'pricing.grace': 'Grace period:',
  'pricing.graceEnd': 'min',
  'pricing.graceFromEnd': 'od konca nabíjania',
  'pricing.graceFromStart': 'od začiatku',
  'pricing.occupy': 'Occupy fee:',
  'access.mode': 'Režim:',
  'access.publicHint': 'Public konektor je dostupný aj pre neregistrovaných používateľov.',
  'access.privateHint': 'Private konektor je dostupný iba pre vybraných registrovaných používateľov.',
  'connector.kicker': 'Konektor',
  'info.block.info-1.title': 'Obsluha nabíjacej stanice',
  'info.block.info-1.body':
    'Úvod do kiosku: stanica, karty konektorov a bezpečné správanie pri obsluhe verejného nabíjania.',
  'info.block.info-2.title': 'Spustenie nabíjania registrovaným užívateľom',
  'info.block.info-2.body':
    'Voľný konektor alebo pripojené vozidlo: štart cez RFID alebo aplikáciu podľa pravidiel stanice.',
  'info.block.info-3.title': 'Začiatok nabíjania',
  'info.block.info-3.body':
    'Príprava a komunikácia pred začatím skutočného nabíjania, sledovanie stavu na karte.',
  'info.block.info-4.title': 'Proces nabíjania',
  'info.block.info-4.body':
    'Priebeh aktívneho nabíjania na displeji bez zobrazenia prihláseného používateľa na kiosku.',
  'info.block.info-5.title': 'Prihlásenie k existujúcemu nabíjaniu',
  'info.block.info-5.body':
    'Overený používateľ na displeji: akcie pri prebiehajúcom nabíjaní a ukončenie session.',
  'info.block.info-6.title': 'Nabíjanie ukončené',
  'info.block.info-6.body':
    'Stav po ukončení alebo pozastavení vozidlom, kontrola energie a bezpečné odpojenie.',
  'info.block.info-7.title': 'Nabíjanie blokované',
  'info.block.info-7.body':
    'Pozastavenie stanicou: čo znamená a ako postupovať pred opakovaným pokusom.',
  'info.block.info-8.title': 'Chyba nabíjacej stanice',
  'info.block.info-8.body':
    'Chybové stavy stanice: bezpečný postup a kontaktovanie podpory s údajmi o stanici.',
};

const rawEn: Messages = {
  'header.provider': 'Provider',
  'header.networkOnline': 'Online',
  'header.networkOffline': 'Offline',
  'station.title': 'Station',
  'station.deviceId': 'Device ID',
  'actions.info': 'Info',
  'actions.support': 'Support',
  'actions.language': 'Language',
  'language.overlayTitle': 'Change language',
  'language.pick': 'Choose interface language:',
  'language.name.SK': 'Slovak',
  'language.name.EN': 'English',
  'language.name.DE': 'German',
  'language.name.DEV': 'DEV (keys)',
  'support.overlayTitle': 'Support',
  'support.intro': 'Need help with charging?',
  'support.lead': 'If charging did not start or stopped unexpectedly, contact us. For urgent issues call helpdesk. For billing or detailed issue description, use email.',
  'support.phoneCardTitle': 'Call helpdesk',
  'support.phoneCardHint': 'Fastest help',
  'support.emailCardTitle': 'Send email',
  'support.emailCardHint': 'Billing and detailed issue description',
  'support.mailPrepTitle': 'In your email include',
  'support.mailPrepOwner': 'Station owner',
  'support.mailPrepStation': 'Station name and station ID',
  'support.mailPrepConnector': 'Connector',
  'support.mailPrepTime': 'Date and time of issue',
  'support.whereTitle': 'Where to find these details',
  'support.whereOwner': 'Owner is shown top-left.',
  'support.whereStation': 'Station name and station ID are in the station row.',
  'support.whereConnector': 'Connector is the large label on each connector card.',
  'support.callbackHint': 'If you cannot reach us by phone, use email.',
  'support.appsHint': 'For easy charging tracking or account setup, use:',
  'support.androidApp': 'Android app',
  'support.appleApp': 'Apple app',
  'support.webApp': 'Web App',
  'support.showQr': 'QR',
  'support.qrTitle': 'QR code',
  'support.qrHint': 'Scan with your phone for quick action.',
  'qr.pay.title': 'Payment options (CSOB GP WebPay)',
  'qr.pay.googlePay': 'Google Pay',
  'qr.pay.applePay': 'Apple Pay',
  'qr.pay.fastPay': 'Fast Pay',
  'qr.pay.cards': 'Visa / Mastercard',
  'info.overlayTitle': 'Info',
  'info.reader.title': 'Help and guides',
  'info.reader.back': 'Back',
  'info.reader.current': 'Current topic',
  'info.reader.topicList': 'Topic list',
  'info.reader.listTitle': 'Select a topic',
  'info.reader.listHint': 'Tap to open a specific guide.',
  'info.reader.context': 'Return',
  'info.reader.section.howto': 'How to proceed',
  'info.reader.section.important': 'Important',
  'info.reader.section.locate': 'Where to find it',
  'info.reader.section.next': 'What follows',
  'info.reader.important.default': 'After authorization, connect the vehicle within 5 minutes or the attempt is canceled.',
  'info.reader.next.none': 'This is the last topic.',
  'info.page.info-1.intro':
    'Basic orientation on the kiosk: station row, connector cards, and safe behaviour at a public charger.',
  'info.page.info-1.howto':
    '1. The station row shows location and device ID.\n2. Connectors are on cards with a clear status.\n3. Open details and pricing via marked blocks with an action strip.',
  'info.page.info-1.important':
    'The kiosk is for short interaction. After finishing steps, park safely and keep walkways clear.',
  'info.page.info-1.locate': 'Station name and device ID are in the station row. Connector label is on the card.',
  'info.page.info-2.intro':
    'When the connector is available or the vehicle is connected, registered users start charging via card or app.',
  'info.page.info-2.howto':
    '1. Pick the correct connector for your bay.\n2. Plug the cable into the vehicle.\n3. Tap RFID or confirm start in the app as prompted on screen.',
  'info.page.info-2.important':
    'Private connectors may require authorization; without it, start is not allowed.',
  'info.page.info-2.locate': '“Available” or “Vehicle connected” is shown on the first connector card on the home screen.',
  'info.page.info-3.intro':
    'After you request start, preparation and communication run between station and vehicle before real charging begins.',
  'info.page.info-3.howto':
    '1. Watch the countdown or preparation state on the card.\n2. Do not replug while the station has not allowed charging.\n3. After charging begins, watch power and energy in the lower block.',
  'info.page.info-3.important':
    'If charging does not start in time, the attempt may cancel. Repeat the flow or contact support.',
  'info.page.info-3.locate': 'Preparation indicators and times are in the middle of the card during preparation.',
  'info.page.info-4.intro':
    'While charging is active, follow the on-screen summary. This applies when no user login is shown on the kiosk.',
  'info.page.info-4.howto':
    '1. Watch power and energy in the lower block.\n2. Keep the cable connected until charging ends.\n3. Stop via app, card, or operator instructions.',
  'info.page.info-4.important':
    'Without user verification, some actions may be limited by station rules.',
  'info.page.info-4.locate': 'Times and power appear in the middle and lower part of the card while charging.',
  'info.page.info-5.intro':
    'When you are verified and the kiosk shows a logged-in user, you get full actions for an ongoing session.',
  'info.page.info-5.howto':
    '1. Authenticate with chip or code as prompted.\n2. Watch transaction state and energy in the lower block.\n3. Stop via session menu or app.',
  'info.page.info-5.important':
    'Leaving connector detail for the station overview resets the kiosk session and requires new authentication.',
  'info.page.info-5.locate': 'Session details and actions are in connector detail and session screens after verification.',
  'info.page.info-6.intro':
    'Charging ended or was paused by the vehicle. Check the state before unplugging.',
  'info.page.info-6.howto':
    '1. Read the status on the card (e.g. ended by vehicle).\n2. Check energy summary in the lower block.\n3. If correct, unplug safely and free the bay.',
  'info.page.info-6.important':
    'If the state does not match the vehicle, use Support with time and connector label.',
  'info.page.info-6.locate': 'Energy in kWh is in the lower block. Times appear in the middle for this state.',
  'info.page.info-7.intro':
    'The station paused charging (blocked by station). Cause may be grid, thermal, or operational.',
  'info.page.info-7.howto':
    '1. Do not force repeated starts without guidance.\n2. Check messages on the card and vehicle.\n3. If it persists, contact support with the station device ID.',
  'info.page.info-7.important':
    'Repeated attempts without support may keep the station in fault longer.',
  'info.page.info-7.locate': 'Device ID is top-right in the station row. Connector label is on the card.',
  'info.page.info-8.intro':
    'The station reports a fault. Depending on type, a transaction may or may not be active. Proceed carefully.',
  'info.page.info-8.howto':
    '1. Read the short status on the card.\n2. Do not continue charging if the system disallows it.\n3. Use Support with a screenshot or exact time.',
  'info.page.info-8.important':
    'Fault with an active transaction may require user verification before the next action.',
  'info.page.info-8.locate': 'Station and connector labels are in the station row and on the connector card.',
  'info.pager.counter': 'Guide',
  'info.pager.of': 'of',
  'info.pager.prev': 'Previous',
  'info.pager.next': 'Next',
  'info.pager.pred': 'Prev:',
  'info.pager.akt': 'Cur:',
  'info.pager.nasl': 'Next:',
  'pricing.overlayTitle': 'Pricing',
  'access.overlayTitle': 'Connector access',
  'connector.stavLabel': 'Connector status',
  'connector.maxPower': 'Max power',
  'connector.priceFrom': 'Price from',
  'connector.price': 'Price',
  'connector.currentPower': 'Current power',
  'connector.energy': 'Energy charged',
  'connector.public': 'Public',
  'connector.private': 'Private',
  'connector.onlyRegistered': 'registered users only',
  'connector.accessPricing': 'Access and pricing',
  'connector.qrPay': 'QR to pay',
  'connector.moreInfo': 'More',
  'connector.tapHint': 'Tap for details',
  'connector.plugType.type2Outlet': 'Type 2 outlet',
  'pricing.hint': 'This is the connector block pricing, not global Info.',
  'pricing.kwh': 'Price per kWh:',
  'pricing.session': 'Session fee:',
  'pricing.parking': 'Parking:',
  'pricing.grace': 'Grace period:',
  'pricing.graceEnd': 'min',
  'pricing.graceFromEnd': 'from end of charging',
  'pricing.graceFromStart': 'from start',
  'pricing.occupy': 'Occupy fee:',
  'access.mode': 'Mode:',
  'access.publicHint': 'Public connector is available to unregistered users too.',
  'access.privateHint': 'Private connector is only available to selected registered users.',
  'connector.kicker': 'Connector',
  'info.block.info-1.title': 'Operating the charging station',
  'info.block.info-1.body':
    'Introduction to the kiosk: station row, connector cards, and safe behaviour at public charging.',
  'info.block.info-2.title': 'Starting charge as a registered user',
  'info.block.info-2.body':
    'Available connector or connected vehicle: start via RFID or app according to station rules.',
  'info.block.info-3.title': 'Beginning of charging',
  'info.block.info-3.body':
    'Preparation and communication before real charging begins; watch status on the card.',
  'info.block.info-4.title': 'Charging process',
  'info.block.info-4.body':
    'Active charging on screen without a logged-in user shown on the kiosk.',
  'info.block.info-5.title': 'Signing in to an existing charging session',
  'info.block.info-5.body':
    'Verified user on display: actions during charging and ending the session.',
  'info.block.info-6.title': 'Charging ended',
  'info.block.info-6.body':
    'State after end or pause by vehicle; check energy and unplug safely.',
  'info.block.info-7.title': 'Charging blocked',
  'info.block.info-7.body':
    'Paused by station: what it means and how to proceed before retrying.',
  'info.block.info-8.title': 'Charging station fault',
  'info.block.info-8.body':
    'Fault states: safe steps and contacting support with station details.',
};

const rawDe: Messages = {
  'header.provider': 'Anbieter',
  'header.networkOnline': 'Online',
  'header.networkOffline': 'Offline',
  'station.title': 'Station',
  'station.deviceId': 'Geräte-ID',
  'actions.info': 'Info',
  'actions.support': 'Support',
  'actions.language': 'Sprache',
  'language.overlayTitle': 'Sprache ändern',
  'language.pick': 'Oberflächensprache wählen:',
  'language.name.SK': 'Slowakisch',
  'language.name.EN': 'Englisch',
  'language.name.DE': 'Deutsch',
  'language.name.DEV': 'DEV (Schlüssel)',
  'support.overlayTitle': 'Support',
  'support.intro': 'Brauchen Sie Hilfe beim Laden?',
  'support.lead': 'Wenn das Laden nicht startet oder unterbrochen wurde, kontaktieren Sie uns. Bei dringenden Problemen anrufen. Für Abrechnung oder detaillierte Problembeschreibung E-Mail nutzen.',
  'support.phoneCardTitle': 'Support anrufen',
  'support.phoneCardHint': 'Schnellste Hilfe',
  'support.emailCardTitle': 'E-Mail senden',
  'support.emailCardHint': 'Abrechnung und detaillierte Problembeschreibung',
  'support.mailPrepTitle': 'In der E-Mail angeben',
  'support.mailPrepOwner': 'Stationsinhaber',
  'support.mailPrepStation': 'Stationsname und Stationskennung',
  'support.mailPrepConnector': 'Stecker',
  'support.mailPrepTime': 'Datum und Uhrzeit des Problems',
  'support.whereTitle': 'Wo Sie die Daten finden',
  'support.whereOwner': 'Inhaber oben links.',
  'support.whereStation': 'Stationsname und Kennung in der Stationszeile.',
  'support.whereConnector': 'Stecker ist die große Bezeichnung an der Karte.',
  'support.callbackHint': 'Wenn telefonisch nicht erreichbar, bitte E-Mail nutzen.',
  'support.appsHint': 'Für bequemes Laden-Tracking oder Kontoerstellung nutzen Sie:',
  'support.androidApp': 'Android-App',
  'support.appleApp': 'Apple-App',
  'support.webApp': 'Web App',
  'support.showQr': 'QR',
  'support.qrTitle': 'QR-Code',
  'support.qrHint': 'Mit dem Telefon scannen für schnelle Aktion.',
  'qr.pay.title': 'Zahlungsoptionen (CSOB GP WebPay)',
  'qr.pay.googlePay': 'Google Pay',
  'qr.pay.applePay': 'Apple Pay',
  'qr.pay.fastPay': 'Fast Pay',
  'qr.pay.cards': 'Visa / Mastercard',
  'info.overlayTitle': 'Info',
  'info.reader.title': 'Hilfe und Anleitungen',
  'info.reader.back': 'Zurück',
  'info.reader.current': 'Aktuelles Thema',
  'info.reader.topicList': 'Themenliste',
  'info.reader.listTitle': 'Thema auswählen',
  'info.reader.listHint': 'Zum Öffnen einer Anleitung antippen.',
  'info.reader.context': 'Rückkehr',
  'info.reader.section.howto': 'Vorgehen',
  'info.reader.section.important': 'Wichtig',
  'info.reader.section.locate': 'Wo zu finden',
  'info.reader.section.next': 'Was folgt',
  'info.reader.important.default': 'Nach der Autorisierung das Fahrzeug innerhalb von 5 Minuten verbinden, sonst wird der Versuch abgebrochen.',
  'info.reader.next.none': 'Dies ist das letzte Thema.',
  'info.page.info-1.intro':
    'Grundorientierung am Kiosk: Stationszeile, Stecker-Karten und sicheres Verhalten an öffentlichen Ladepunkten.',
  'info.page.info-1.howto':
    '1. In der Stationszeile sehen Sie Standort und Geräte-ID.\n2. Stecker sind auf Karten mit klarem Status dargestellt.\n3. Details und Preise öffnen Sie über markierte Blöcke mit Aktionsstreifen.',
  'info.page.info-1.important':
    'Der Kiosk ist für kurze Bedienung gedacht. Nach Abschluss das Fahrzeug sicher parken und Wege freihalten.',
  'info.page.info-1.locate': 'Stationsname und Geräte-ID stehen oben in der Stationszeile. Steckerbezeichnung ist auf der Karte.',
  'info.page.info-2.intro':
    'Wenn der Stecker frei ist oder das Fahrzeug verbunden ist, starten registrierte Nutzer per Karte oder App.',
  'info.page.info-2.howto':
    '1. Wählen Sie den passenden Stecker zum Parkplatz.\n2. Kabel mit dem Fahrzeug verbinden.\n3. RFID anlegen oder Start in der App bestätigen.',
  'info.page.info-2.important':
    'Private Stecker können eine Autorisierung verlangen; ohne diese ist kein Start möglich.',
  'info.page.info-2.locate': '„Verfügbar“ oder „Fahrzeug verbunden“ steht auf der ersten Stecker-Karte der Startseite.',
  'info.page.info-3.intro':
    'Nach Startwunsch läuft Vorbereitung und Kommunikation zwischen Station und Fahrzeug vor dem eigentlichen Laden.',
  'info.page.info-3.howto':
    '1. Countdown oder Vorbereitung auf der Karte beobachten.\n2. Kabel nicht umstecken, bevor die Station freigibt.\n3. Nach Ladebeginn Leistung und Energie im unteren Block prüfen.',
  'info.page.info-3.important':
    'Startet das Laden nicht rechtzeitig, kann der Versuch abgebrochen werden. Vorgang wiederholen oder Support kontaktieren.',
  'info.page.info-3.locate': 'Vorbereitungsanzeigen und Zeiten stehen in der Mitte der Karte während der Vorbereitung.',
  'info.page.info-4.intro':
    'Während aktivem Laden den Bildschirm beobachten. Gilt, wenn kein angemeldeter Nutzer auf dem Kiosk angezeigt wird.',
  'info.page.info-4.howto':
    '1. Leistung und Energie im unteren Block beobachten.\n2. Kabel bis zum Ende verbunden lassen.\n3. Beenden per App, Karte oder Betreiberanweisung.',
  'info.page.info-4.important':
    'Ohne Nutzerprüfung können Aktionen stationsbedingt eingeschränkt sein.',
  'info.page.info-4.locate': 'Zeiten und Leistung erscheinen in der Mitte und unten auf der Karte beim Laden.',
  'info.page.info-5.intro':
    'Nach erfolgreicher Anmeldung und angezeigtem Nutzer stehen volle Aktionen für die laufende Session bereit.',
  'info.page.info-5.howto':
    '1. Mit Chip oder Code wie angezeigt authentifizieren.\n2. Transaktion und Energie im unteren Block prüfen.\n3. Beenden über Session-Menü oder App.',
  'info.page.info-5.important':
    'Wechsel vom Stecker-Detail zur Stationsübersicht setzt die Kiosk-Session zurück und erfordert neue Anmeldung.',
  'info.page.info-5.locate': 'Session-Daten und Aktionen finden Sie im Stecker-Detail und nach Verifizierung in der Session-Ansicht.',
  'info.page.info-6.intro':
    'Laden beendet oder vom Fahrzeug pausiert. Status prüfen, bevor das Kabel getrennt wird.',
  'info.page.info-6.howto':
    '1. Status auf der Karte lesen (z. B. vom Fahrzeug beendet).\n2. Energiesumme im unteren Block prüfen.\n3. Bei Plausibilität Kabel sicher lösen und Platz freimachen.',
  'info.page.info-6.important':
    'Stimmt der Status nicht mit dem Fahrzeug überein, Support mit Zeit und Steckerbezeichnung kontaktieren.',
  'info.page.info-6.locate': 'Energie in kWh steht im unteren Block. Zeiten in der Mitte bei diesem Status.',
  'info.page.info-7.intro':
    'Die Station hat das Laden pausiert (durch Station blockiert). Ursache kann Netz, Temperatur oder Betrieb sein.',
  'info.page.info-7.howto':
    '1. Keine erzwungenen Neustarts ohne Hinweis.\n2. Meldungen auf Karte und Fahrzeug prüfen.\n3. Bei anhaltendem Problem Support mit Geräte-ID kontaktieren.',
  'info.page.info-7.important':
    'Wiederholte Versuche ohne Fachkraft können die Station länger im Fehler halten.',
  'info.page.info-7.locate': 'Geräte-ID steht rechts oben in der Stationszeile. Steckerbezeichnung ist auf der Karte.',
  'info.page.info-8.intro':
    'Die Station meldet einen Fehler. Je nach Typ kann eine Transaktion aktiv sein oder nicht. Vorsichtig vorgehen.',
  'info.page.info-8.howto':
    '1. Kurzstatus auf der Karte lesen.\n2. Nicht weiterladen, wenn das System es nicht erlaubt.\n3. Support mit Screenshot oder exakter Uhrzeit.',
  'info.page.info-8.important':
    'Fehler mit laufender Transaktion kann vor der nächsten Aktion eine Nutzerprüfung erfordern.',
  'info.page.info-8.locate': 'Stations- und Steckerbezeichnung stehen in der Stationszeile und auf der Stecker-Karte.',
  'info.pager.counter': 'Anleitung',
  'info.pager.of': 'von',
  'info.pager.prev': 'Zurück',
  'info.pager.next': 'Weiter',
  'info.pager.pred': 'Vor:',
  'info.pager.akt': 'Akt:',
  'info.pager.nasl': 'Näch:',
  'pricing.overlayTitle': 'Preisliste',
  'access.overlayTitle': 'Stecker-Zugang',
  'connector.stavLabel': 'Steckerstatus',
  'connector.maxPower': 'Max. Leistung',
  'connector.priceFrom': 'Preis ab',
  'connector.price': 'Preis',
  'connector.currentPower': 'Aktuelle Leistung',
  'connector.energy': 'Geladene Energie',
  'connector.public': 'Öffentlich',
  'connector.private': 'Privat',
  'connector.onlyRegistered': 'nur für Registrierte',
  'connector.accessPricing': 'Zugang und Preis',
  'connector.qrPay': 'QR to pay',
  'connector.moreInfo': 'Mehr',
  'connector.tapHint': 'Tippen für Details',
  'connector.plugType.type2Outlet': 'Typ-2-Steckdose',
  'pricing.hint': 'Dies ist die Stecker-Preisliste, nicht globales Info.',
  'pricing.kwh': 'Preis pro kWh:',
  'pricing.session': 'Sitzungsgebühr:',
  'pricing.parking': 'Parken:',
  'pricing.grace': 'Karenzzeit:',
  'pricing.graceEnd': 'Min',
  'pricing.graceFromEnd': 'ab Ladeende',
  'pricing.graceFromStart': 'ab Start',
  'pricing.occupy': 'Blockiergebühr:',
  'access.mode': 'Modus:',
  'access.publicHint': 'Öffentlicher Stecker ist auch für nicht registrierte Nutzer verfügbar.',
  'access.privateHint': 'Privater Stecker nur für ausgewählte registrierte Nutzer.',
  'connector.kicker': 'Stecker',
  'info.block.info-1.title': 'Bedienung der Ladestation',
  'info.block.info-1.body':
    'Einstieg in den Kiosk: Stationszeile, Stecker-Karten und sicheres Verhalten an öffentlichen Ladepunkten.',
  'info.block.info-2.title': 'Laden starten als registrierter Nutzer',
  'info.block.info-2.body':
    'Freier Stecker oder verbundenes Fahrzeug: Start per RFID oder App gemäß Stationsregeln.',
  'info.block.info-3.title': 'Ladebeginn',
  'info.block.info-3.body':
    'Vorbereitung und Kommunikation vor dem eigentlichen Laden; Status auf der Karte.',
  'info.block.info-4.title': 'Ladevorgang',
  'info.block.info-4.body':
    'Aktives Laden auf dem Bildschirm ohne angezeigten angemeldeten Nutzer am Kiosk.',
  'info.block.info-5.title': 'Anmeldung zu laufendem Laden',
  'info.block.info-5.body':
    'Verifizierter Nutzer auf dem Display: Aktionen während des Ladens und Session beenden.',
  'info.block.info-6.title': 'Laden beendet',
  'info.block.info-6.body':
    'Status nach Ende oder Pause durch Fahrzeug; Energie prüfen und sicher abstecken.',
  'info.block.info-7.title': 'Laden blockiert',
  'info.block.info-7.body':
    'Durch Station pausiert: Bedeutung und Vorgehen vor einem erneuten Versuch.',
  'info.block.info-8.title': 'Fehler der Ladestation',
  'info.block.info-8.body':
    'Fehlerzustände: sicheres Vorgehen und Support mit Stationsangaben.',
};

const byLang: Record<Exclude<LanguageCode, 'DEV'>, Messages> = {
  SK: withTpPrefix(rawSk),
  EN: withTpPrefix(rawEn),
  DE: withTpPrefix(rawDe),
};

const statusKeys: Record<ConnectorStatus, string> = {
  available: toTpKey('connector.status.available'),
  EVconnected: toTpKey('connector.status.EVconnected'),
  connectEV: toTpKey('connector.status.connectEV'),
  cennectEV: toTpKey('connector.status.cennectEV'),
  preparing: toTpKey('connector.status.preparing'),
  charging: toTpKey('connector.status.charging'),
  suspendedEV: toTpKey('connector.status.suspendedEV'),
  suspendedEVSE: toTpKey('connector.status.suspendedEVSE'),
  suspended: toTpKey('connector.status.suspended'),
  finishing: toTpKey('connector.status.finishing'),
  faultedWithTransa: toTpKey('connector.status.faultedWithTransa'),
  faultedWithoutTransa: toTpKey('connector.status.faultedWithoutTransa'),
  faulted: toTpKey('connector.status.faulted'),
};

const statusSk: Record<ConnectorStatus, string> = {
  available: 'Dostupné',
  EVconnected: 'Vozidlo pripojené',
  connectEV: 'Pripojte vozidlo',
  cennectEV: 'Pripojte vozidlo',
  preparing: 'Pripravuje sa',
  charging: 'Nabíjanie prebieha',
  suspendedEV: 'Pozastavené vozidlom',
  suspendedEVSE: 'Pozastavené stanicou',
  suspended: 'Pozastavené',
  finishing: 'Ukončovanie',
  faultedWithTransa: 'Porucha počas transakcie',
  faultedWithoutTransa: 'Porucha bez transakcie',
  faulted: 'Porucha',
};

const statusEn: Record<ConnectorStatus, string> = {
  available: 'Available',
  EVconnected: 'Vehicle connected',
  connectEV: 'Connect vehicle',
  cennectEV: 'Connect vehicle',
  preparing: 'Preparing',
  charging: 'Charging',
  suspendedEV: 'Suspended by EV',
  suspendedEVSE: 'Suspended by station',
  suspended: 'Suspended',
  finishing: 'Finishing',
  faultedWithTransa: 'Fault with transaction',
  faultedWithoutTransa: 'Fault without transaction',
  faulted: 'Fault',
};

const statusDe: Record<ConnectorStatus, string> = {
  available: 'Verfügbar',
  EVconnected: 'Fahrzeug verbunden',
  connectEV: 'Fahrzeug anschließen',
  cennectEV: 'Fahrzeug anschließen',
  preparing: 'Vorbereitung',
  charging: 'Ladevorgang',
  suspendedEV: 'Vom Fahrzeug pausiert',
  suspendedEVSE: 'Von Station pausiert',
  suspended: 'Pausiert',
  finishing: 'Beenden',
  faultedWithTransa: 'Störung mit Transaktion',
  faultedWithoutTransa: 'Störung ohne Transaktion',
  faulted: 'Störung',
};

const statusByLang: Record<Exclude<LanguageCode, 'DEV'>, Record<ConnectorStatus, string>> = {
  SK: statusSk,
  EN: statusEn,
  DE: statusDe,
};

export function t(lang: LanguageCode, key: string): string {
  const tpKey = toTpKey(key);
  if (lang === 'DEV') return tpKey;
  return byLang[lang][tpKey] ?? tpKey;
}

export function tStatus(lang: LanguageCode, status: ConnectorStatus): string {
  if (lang === 'DEV') return statusKeys[status];
  return statusByLang[lang][status];
}

export const INFO_BLOCK_IDS = [
  'info-1',
  'info-2',
  'info-3',
  'info-4',
  'info-5',
  'info-6',
  'info-7',
  'info-8',
] as const;

export function tInfoBlock(
  lang: LanguageCode,
  id: (typeof INFO_BLOCK_IDS)[number],
  part: 'title' | 'body'
): string {
  const key = `info.block.${id}.${part}`;
  return t(lang, key);
}
