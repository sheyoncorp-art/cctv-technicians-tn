const ta = {
  'Feed': 'பதிவுகள்',
  'Jobs': 'வேலை',
  'Technicians': 'டெக்னீசியன்கள்',
  'Me': 'என் கணக்கு',
  'All': 'அனைத்தும்',
  'Technical tip': 'தொழில்நுட்ப குறிப்பு',
  'Doubt / Question': 'சந்தேகம் / கேள்வி',
  'Staff needed': 'ஊழியர் தேவை',
  'Contract technician needed': 'கான்ட்ராக்ட் டெக்னீசியன் தேவை',
  'Technician available': 'டெக்னீசியன் வேலைக்குத் தயார்',
  'Post': 'பதிவிடு',
  'Cancel': 'ரத்து',
  'Call': 'அழை',
  'WhatsApp': 'வாட்ஸ்அப்',
  'Log in': 'உள்நுழை',
  'Sign up': 'பதிவு செய்',
  'Log out': 'வெளியேறு',
  'All districts': 'அனைத்து மாவட்டங்களும்',
  'Search name or skill': 'பெயர் அல்லது திறன் தேடு',
  'Reply': 'பதில்',
  'Answers & replies': 'பதில்கள்',
  'Write a reply': 'பதில் எழுதுங்கள்',
  'Nothing here yet': 'இங்கு இன்னும் எதுவும் இல்லை',
  'Edit profile': 'சுயவிவரம் திருத்து',
  'Save': 'சேமி',
  'Close job': 'வேலையை மூடு',
  'Reopen': 'மீண்டும் திற',
  'Delete': 'நீக்கு',
  'Report': 'புகார்',
  'Community rules': 'சமூக விதிகள்',
};

let lang = 'en';
try { lang = localStorage.getItem('lang') || 'en'; } catch (e) { /* ignore */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('lang', l); } catch (e) { /* ignore */ }
}
export const t = (s) => (lang === 'ta' && ta[s]) || s;
