const FALLBACK_COLOR = '#56618E';
const MINIMUM_CONTRAST = 5.3;

function luminance(channels) {
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function readableTextColor(color) {
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) return FALLBACK_COLOR;

  const channels = color.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16));
  while (((1.05) / (luminance(channels) + 0.05)) < MINIMUM_CONTRAST && channels.some((channel) => channel > 0)) {
    for (let index = 0; index < channels.length; index += 1) {
      channels[index] = Math.floor(channels[index] * 0.92);
    }
  }

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
