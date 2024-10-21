import _ from "lodash";

/**
 * Component Model Viewer utils.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */
function _s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
}

export default {
    /* new generation */
    PATH_SEPARATOR: '/',
    MAPPING_SEPARATOR: '.',
    COLOR_FOREGROUND: "#808080",
    COLOR_BACKGROUND: "#FFFFFF",

    COLOR_BASIC_TEXT: "#808080",
    COLOR_BASIC_BODY: "#FFFFFF",
    COLOR_COMPOSITE_TEXT: "#FFFFFF",
    COLOR_COMPOSITE_HEADER: "#808080",
    COLOR_COMPOSITE_BODY: "#FFFFFF",
    COLOR_CONNECTOR_TEXT: "#808080",
    COLOR_CONNECTOR_BODY: "#FFFFFF",
    COLOR_HIGHLIGHT: "#000000",
    colorLuminance: function(hex, lum) {

        // validate hex string
        hex = String(hex).replace(/[^0-9a-f]/gi, '');
        if (hex.length < 6) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        lum = lum || 0;

        // convert to decimal and change luminosity
        var rgb = "#",
            c, i;
        for (i = 0; i < 3; i++) {
            c = parseInt(hex.substr(i * 2, 2), 16);
            c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
            rgb += ("00" + c).substr(c.length);
        }
        return rgb;
    },
    /**
     * Converts an RGB color value to HSL. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
     * Assumes r, g, and b are contained in the set [0, 255] and
     * returns h, s, and l in the set [0, 1].
     *
     * @param   Number  r       The red color value
     * @param   Number  g       The green color value
     * @param   Number  b       The blue color value
     * @return  Array           The HSL representation
     */
    rgbToHsl(r, g, b) {
        //console.log(`rgbToHsl(${r},${g},${b})`)
        r /= 255, g /= 255, b /= 255;

        var max = Math.max(r, g, b),
            min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if (max == min) {
            h = s = 0; // achromatic
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }

            h /= 6;
        }

        return { h, s, l };
    },
    hexToRgb(hex) {
        //console.log(`hexToRgb(${hex})`)
        var result = /^#?([a-fA-F\d]{2})([a-fA-F\d]{2})([a-fA-F\d]{2})([a-fA-F\d]{2})?$/i.exec(hex);
        //console.log(JSON.stringify(result));
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: parseInt(result[4], 16)
        } : null;
    },

    RGBToHSL(rgb) {
        //console.log(`RGBToHSL(${rgb})`)
        let { r, g, b } = this.hexToRgb(rgb);
        let { h, s, l } = this.rgbToHsl(r, g, b);
        return `hsl(${h},${s}%,${l}%);`
    },

    /* inherited */
    URL_ROOT: 'http://' + location.hostname + ':10010/paascontroller/api/v1',
    QUERY_LIMIT: 4,
    DESIGN_COMPONENT_WIDTH: 120,
    DESIGN_COMPONENT_HEIGHT: 80,
    DESIGN_COMPONENT_STROKE: 'gray',
    DESIGN_WRITE_COMPONENT_STROKE: 'blue',
    DESIGN_PORT_RADIUS: 10,
    DESIGN_CONNECTOR_WIDTH: 80,
    DESIGN_CONNECTOR_HEIGHT: 80,
    DESIGN_CONNECTOR_RADIUS: 40,
    DESIGN_CONNECTOR_STROKE: 'gray',
    DESIGN_WRITE_CONNECTOR_STROKE: '#0277bd',
    DESIGN_HEADER_HEIGHT: 32,
    DESIGN_NOHEADER_FILL: 'white',
    DESIGN_HEADER_FILL: {
        type: 'linearGradient',
        stops: [
            { offset: '0%', color: '#999' },
            { offset: '100%', color: '#ccc' }
        ]
    },
    DESIGN_WRITE_HEADER_FILL: {
        type: 'linearGradient',
        stops: [
            { offset: '0%', color: 'blue' },
            { offset: '100%', color: '#0277bd' }
        ]
    },
    DESIGN_HEADER_TITLE_FILL: 'white',
    DESIGN_WRITE_HEADER_TITLE_FILL: 'white',
    DESIGN_NOHEADER_TITLE_FILL: 'gray',
    DESIGN_WRITE_NOHEADER_TITLE_FILL: 'blue',
    DESIGN_HEADER_ICON_FILL: 'white',
    DESIGN_BODY_FILL: 'white',
    DESIGN_WRITE_BODY_FILL: 'white',
    DESIGN_BODY_TITLE_FILL: 'gray',
    DESIGN_WRITE_BODY_TITLE_FILL: '#0277bd',
    DESIGN_BODY_ICON_FILL: 'darkgray',
    DESIGN_WRITE_BODY_ICON_FILL: '#0277bd',
    DESIGN_BODY_ICON_FILL_HIGHLIGHTED: 'gray',
    DESIGN_WRITE_BODY_ICON_FILL_HIGHLIGHTED: 'blue',
    DESIGN_FOOTER_HEIGHT: 24,
    DESIGN_FOOTER_FILL: 'white',
    DESIGN_WRITE_FOOTER_FILL: 'white',
    DESIGN_FOOTER_TITLE_FILL: 'darkgray',
    DESIGN_WRITE_FOOTER_TITLE_FILL: '#0277bd',
    DESIGN_ICON_WIDTH: 24,
    DESIGN_DISPLAY_FACTOR: 5,
    DESIGN_COLOR_BLUE: '#0277bd',
    DESIGN_PORT_MOVING_COLOR: '#0277bd',
    DESIGN_CONNECTING_COLOR: '#0277bd',
    DESIGN_PORT_CONNECTING_COLOR: '#0277bd',
    DESIGN_CONNECTOR_CONNECTING_COLOR: '#0277bd',
    DESIGN_SELECT_COLOR: '#404040',
    DESIGN_WRITE_SELECT_COLOR: 'blue',
    DESIGN_PORT_STROKE: 'gray',
    DESIGN_WRITE_PORT_STROKE: 'blue',
    DESIGN_PORT_TITLE_FILL: 'gray',
    DESIGN_WRITE_PORT_TITLE_FILL: 'blue',
    /*DESIGN_PORT_STRONG_COLOR: 'gray',
    DESIGN_WRITE_PORT_STRONG_COLOR: 'gray',*/
    icons: {
        volume: '<path d="M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z" />',
        variable: '<path d="M20.41,3C21.8,5.71 22.35,8.84 22,12C21.8,15.16 20.7,18.29 18.83,21L17.3,20C18.91,17.57 19.85,14.8 20,12C20.34,9.2 19.89,6.43 18.7,4L20.41,3M5.17,3L6.7,4C5.09,6.43 4.15,9.2 4,12C3.66,14.8 4.12,17.57 5.3,20L3.61,21C2.21,18.29 1.65,15.17 2,12C2.2,8.84 3.3,5.71 5.17,3M12.08,10.68L14.4,7.45H16.93L13.15,12.45L15.35,17.37H13.09L11.71,14L9.28,17.33H6.76L10.66,12.21L8.53,7.45H10.8L12.08,10.68Z" />',
        readonly: '<path d="M10,10.2L14,6.2L17.8,10L13.8,14L12.4,12.6L15,9.9L14.1,9L11.5,11.6L10,10.2M20.7,5.6L18.4,3.3C18.2,3.1 17.9,3 17.7,3C17.5,3 17.2,3.1 17,3.3L15.2,5.1L19,8.9L20.7,7C21.1,6.7 21.1,6 20.7,5.6M19,21.7L17.7,23L11.2,16.5L6.8,21H3V17.2L7.5,12.7L1,6.3L2.3,5L19,21.7M9.8,15.1L8.9,14.2L5,18.1V19H5.9L9.8,15.1Z" />',
        lock: '<path d="M12,17C10.89,17 10,16.1 10,15C10,13.89 10.89,13 12,13A2,2 0 0,1 14,15A2,2 0 0,1 12,17M18,20V10H6V20H18M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z" />',
        eye: '<path d="M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9M12,4.5C17,4.5 21.27,7.61 23,12C21.27,16.39 17,19.5 12,19.5C7,19.5 2.73,16.39 1,12C2.73,7.61 7,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C15.76,17.5 19.17,15.36 20.82,12C19.17,8.64 15.76,6.5 12,6.5C8.24,6.5 4.83,8.64 3.18,12Z" />',
        //variable: '<path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z" />',
        /*calendar: '<path d="M15,13H16.5V15.82L18.94,17.23L18.19,18.53L15,16.69V13M19,8H5V19H9.67C9.24,18.09 9,17.07 9,16A7,7 0 0,1 16,9C17.07,9 18.09,9.24 19,9.67V8M5,21C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3H6V1H8V3H16V1H18V3H19A2,2 0 0,1 21,5V11.1C22.24,12.36 23,14.09 23,16A7,7 0 0,1 16,23C14.09,23 12.36,22.24 11.1,21H5M16,11.15A4.85,4.85 0 0,0 11.15,16C11.15,18.68 13.32,20.85 16,20.85A4.85,4.85 0 0,0 20.85,16C20.85,13.32 18.68,11.15 16,11.15Z" />',
        link: '<path d="M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76V7.76L12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.59,9.17C9.41,10.34 9.41,12.24 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24V16.24L11.29,19.78C9.34,21.73 6.17,21.73 4.22,19.78C2.27,17.83 2.27,14.66 4.22,12.71L5.71,11.22C5.7,12.04 5.83,12.86 6.11,13.65L5.64,14.12C4.46,15.29 4.46,17.19 5.64,18.36C6.81,19.54 8.71,19.54 9.88,18.36L13.41,14.83C14.59,13.66 14.59,11.76 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z" />',
        'link-off': '<path d="M2,5.27L3.28,4L20,20.72L18.73,22L13.9,17.17L11.29,19.78C9.34,21.73 6.17,21.73 4.22,19.78C2.27,17.83 2.27,14.66 4.22,12.71L5.71,11.22C5.7,12.04 5.83,12.86 6.11,13.65L5.64,14.12C4.46,15.29 4.46,17.19 5.64,18.36C6.81,19.54 8.71,19.54 9.88,18.36L12.5,15.76L10.88,14.15C10.87,14.39 10.77,14.64 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C8.12,13.77 7.63,12.37 7.72,11L2,5.27M12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.79,8.97L9.38,7.55L12.71,4.22M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.2,10.54 16.61,12.5 16.06,14.23L14.28,12.46C14.23,11.78 13.94,11.11 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z" />',
        sync: '<path d="M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z" />',
        'sync-alert': '<path d="M11,13H13V7H11M21,4H15V10L17.24,7.76C18.32,8.85 19,10.34 19,12C19,14.61 17.33,16.83 15,17.65V19.74C18.45,18.85 21,15.73 21,12C21,9.79 20.09,7.8 18.64,6.36M11,17H13V15H11M3,12C3,14.21 3.91,16.2 5.36,17.64L3,20H9V14L6.76,16.24C5.68,15.15 5,13.66 5,12C5,9.39 6.67,7.17 9,6.35V4.26C5.55,5.15 3,8.27 3,12Z" />',
        'sync-cloud': '<path d="M12,4C15.64,4 18.67,6.59 19.35,10.04C21.95,10.22 24,12.36 24,15A5,5 0 0,1 19,20H6A6,6 0 0,1 0,14C0,10.91 2.34,8.36 5.35,8.04C6.6,5.64 9.11,4 12,4M7.5,9.69C6.06,11.5 6.2,14.06 7.82,15.68C8.66,16.5 9.81,17 11,17V18.86L13.83,16.04L11,13.21V15C10.34,15 9.7,14.74 9.23,14.27C8.39,13.43 8.26,12.11 8.92,11.12L7.5,9.69M9.17,8.97L10.62,10.42L12,11.79V10C12.66,10 13.3,10.26 13.77,10.73C14.61,11.57 14.74,12.89 14.08,13.88L15.5,15.31C16.94,13.5 16.8,10.94 15.18,9.32C14.34,8.5 13.19,8 12,8V6.14L9.17,8.97Z" />',
        'sync-off': '<path d="M20,4H14V10L16.24,7.76C17.32,8.85 18,10.34 18,12C18,13 17.75,13.94 17.32,14.77L18.78,16.23C19.55,15 20,13.56 20,12C20,9.79 19.09,7.8 17.64,6.36L20,4M2.86,5.41L5.22,7.77C4.45,9 4,10.44 4,12C4,14.21 4.91,16.2 6.36,17.64L4,20H10V14L7.76,16.24C6.68,15.15 6,13.66 6,12C6,11 6.25,10.06 6.68,9.23L14.76,17.31C14.5,17.44 14.26,17.56 14,17.65V19.74C14.79,19.53 15.54,19.2 16.22,18.78L18.58,21.14L19.85,19.87L4.14,4.14L2.86,5.41M10,6.35V4.26C9.2,4.47 8.45,4.8 7.77,5.22L9.23,6.68C9.5,6.56 9.73,6.44 10,6.35Z" />',
        app: '<path d="M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z" /><path fill="white" d="m 16.976322,14.899832 c 0,0.210185 -0.116154,0.392712 -0.293149,0.486739 l -4.369593,2.455823 c -0.0885,0.06637 -0.199121,0.09956 -0.315275,0.09956 -0.116155,0 -0.226777,-0.03318 -0.315274,-0.09956 L 7.3134375,15.386571 C 7.1364412,15.292544 7.0202876,15.110017 7.0202876,14.899832 l 0,-4.978017 c 0,-0.2101824 0.1161536,-0.3927111 0.2931499,-0.4867394 L 11.683031,6.9792531 c 0.0885,-0.066372 0.199119,-0.09956 0.315274,-0.09956 0.116154,0 0.226776,0.033187 0.315275,0.09956 l 4.369593,2.4558225 c 0.176995,0.094029 0.293149,0.276557 0.293149,0.4867394 l 0,4.978017 M 11.998305,8.0688859 8.7017514,9.921815 l 3.2965536,1.85293 3.296554,-1.85293 -3.296554,-1.8529291 m -3.8717913,6.5046091 3.3186783,1.869524 0,-3.711388 -3.3186783,-1.863992 0,3.705856 m 7.7435833,0 0,-3.705856 -3.318678,1.863992 0,3.711388 3.318678,-1.869524 z" />',
        'app-outline': '<path d="M19,18H6A4,4 0 0,1 2,14A4,4 0 0,1 6,10H6.71C7.37,7.69 9.5,6 12,6A5.5,5.5 0 0,1 17.5,11.5V12H19A3,3 0 0,1 22,15A3,3 0 0,1 19,18M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z" /><path d="m 16.411356,14.916548 c 0,0.192368 -0.106308,0.359425 -0.268303,0.445485 l -3.999236,2.247671 c -0.08099,0.06075 -0.182243,0.09112 -0.288552,0.09112 -0.106309,0 -0.207555,-0.03037 -0.288553,-0.09112 L 7.5674572,15.362033 C 7.4054628,15.275973 7.299154,15.108916 7.299154,14.916548 l 0,-4.556092 c 0,-0.192368 0.1063088,-0.359424 0.2683032,-0.4454825 L 11.566712,7.6673202 c 0.08099,-0.06075 0.182244,-0.091122 0.288553,-0.091122 0.106309,0 0.207555,0.030375 0.288552,0.091122 l 3.999236,2.2476533 c 0.161995,0.086059 0.268303,0.2531145 0.268303,0.4454825 l 0,4.556092 M 11.855265,8.6645975 8.8381005,10.360456 11.855265,12.056335 14.87241,10.360456 11.855265,8.6645975 m -3.5436462,5.9532735 3.0374142,1.711065 0,-3.396819 -3.0374142,-1.706003 0,3.391757 m 7.0872722,0 0,-3.391757 -3.037393,1.706003 0,3.396819 3.037393,-1.711065 z" />',
        'app-alt': '<path d="M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z" /><path d="m 17.338983,15.545198 c 0,0.229717 -0.126949,0.429209 -0.320396,0.531977 l -4.775706,2.684068 c -0.09672,0.07254 -0.217627,0.108814 -0.344576,0.108814 -0.126949,0 -0.247853,-0.03627 -0.344576,-0.108814 L 6.7780226,16.077175 C 6.5845763,15.974407 6.4576271,15.774915 6.4576271,15.545198 l 0,-5.440678 c 0,-0.2297176 0.1269492,-0.4292091 0.3203955,-0.5319775 L 11.553729,6.888475 c 0.09672,-0.072542 0.217627,-0.1088136 0.344576,-0.1088136 0.126949,0 0.247853,0.036271 0.344576,0.1088136 l 4.775706,2.6840675 c 0.193447,0.1027684 0.320396,0.3022599 0.320396,0.5319775 l 0,5.440678 M 11.898305,8.0793787 8.2953674,10.10452 11.898305,12.129661 15.501243,10.10452 11.898305,8.0793787 Z" style="fill:white" />',
        'load-balancer': '<path d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" /><text style="font-style:normal;font-weight:normal;font-size:40px;line-height:125%;font-family:sans-serif;letter-spacing:0px;word-spacing:0px;fill:#000000;fill-opacity:1;stroke:none;stroke-width:1px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1" x="6.7118645" y="16.372879"><tspan x="6.7118645" y="16.372879" style="font-size:12.5px">lb</tspan></text>',
        'pub-sub': '<path d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" /><text style="font-style:normal;font-weight:normal;font-size:40px;line-height:125%;font-family:sans-serif;letter-spacing:0px;word-spacing:0px;fill:#000000;fill-opacity:1;stroke:none;stroke-width:1px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1" y="15.084745"><tspan x="5.1186447" y="15.084745" style="font-size:12.5px">ps</tspan></text>',
        'basic': '<path d="M 5 4 A 2 2 0 0 0 3 6 L 3 18 C 3 19.1 3.89 20 5 20 L 19 20 A 2 2 0 0 0 21 18 L 21 6 C 21 4.9 20.11 4 19 4 L 5 4 z M 4.9824219 6.203125 L 19.017578 6.203125 L 19.017578 18 L 19 18 L 5 18 L 4.9824219 18 L 4.9824219 6.203125 z " />',
        'aggregate': '<path d="M19,4C20.11,4 21,4.9 21,6V18A2,2 0 0,1 19,20H5C3.89,20 3,19.1 3,18V6A2,2 0 0,1 5,4H19M19,18V8H5V18H19Z" /><path d="m 8.4601552,9.5131656 a 0.9691324,0.90193889 0 0 0 -0.969133,0.9019384 l 0,5.411633 c 0,0.496067 0.4312646,0.90194 0.969133,0.90194 l 6.7839258,0 a 0.9691324,0.90193889 0 0 0 0.969133,-0.90194 l 0,-5.411633 c 0,-0.496066 -0.431263,-0.9019384 -0.969133,-0.9019384 l -6.7839258,0 z m -0.00852,0.9935424 6.8009628,0 0,5.320029 -0.0085,0 -6.7839263,0 -0.00852,0 0,-5.320029 z" />',
        'aggregate2': '<path d="M19,4C20.11,4 21,4.9 21,6V18A2,2 0 0,1 19,20H5C3.89,20 3,19.1 3,18V6A2,2 0 0,1 5,4H19M19,18V8H5V18H19Z" /><path d="m 6.3897549,8.7572385 a 0.86414254,0.86414254 0 0 0 -0.864143,0.8641423 l 0,5.1848552 c 0,0.475279 0.384544,0.864143 0.864143,0.864143 l 6.0489971,0 a 0.86414254,0.86414254 0 0 0 0.864143,-0.864143 l 0,-5.1848552 c 0,-0.4752783 -0.384543,-0.8641423 -0.864143,-0.8641423 l -6.0489971,0 z m -0.0076,0.9519073 6.0641881,0 0,5.0970902 -0.0076,0 -6.0489981,0 -0.0076,0 0,-5.0970902 z" /><path d="m 11.461025,10.44098 a 0.86414254,0.86414254 0 0 0 -0.864143,0.864142 l 0,5.184854 c 0,0.475279 0.384544,0.864143 0.864143,0.864143 l 6.048997,0 a 0.86414254,0.86414254 0 0 0 0.864143,-0.864143 l 0,-5.184854 c 0,-0.475278 -0.384543,-0.864142 -0.864143,-0.864142 l -6.048997,0 z m -0.0076,0.951907 6.064188,0 0,5.097089 -0.0076,0 -6.048998,0 -0.0076,0 0,-5.097089 z" />',
        'aggregate3': '<path d="M19,4C20.11,4 21,4.9 21,6V18A2,2 0 0,1 19,20H5C3.89,20 3,19.1 3,18V6A2,2 0 0,1 5,4H19M19,18V8H5V18H19Z" /><rect y="10.341434" x="7.6845169" height="5.6273971" width="8.5808849" />',
        'input': '<path d="M 14.235542,2.9308991 C 10.131174,3.1391534 6.7455833,6.0340216 5.7537377,9.8804353 l 1.3995594,0 C 8.1077853,6.7668887 10.937504,4.4660517 14.320003,4.2942437 c 0.134729,-0.00772 0.261627,0 0.398146,0 0.136505,0 0.263372,-0.00772 0.398154,0 4.179297,0.2126557 7.516512,3.6756098 7.516604,7.9027033 0,4.363459 -3.546549,7.890735 -7.914758,7.890658 -3.562531,0 -6.5748594,-2.340759 -7.5648519,-5.574146 l -1.4116284,0 c 1.0283384,3.994593 4.6583663,6.949536 8.9764803,6.949536 5.117755,0 9.26601,-4.153815 9.266049,-9.266048 -7.6e-5,-4.9523936 -3.887215,-9.0169457 -8.783441,-9.2660479 -0.158018,-0.00772 -0.322653,0 -0.482608,0 -0.159963,0 -0.324674,-0.00772 -0.482607,0 z" /><path d="m 11.090153,7.4369785 -0.951473,1.2373265 2.664527,2.759507 -12.74608248,0 0,1.54434 12.73706248,0 -2.655507,2.759353 0.951473,1.219411 4.750911,-4.751011 z" />',
        'output': '<path d="m 8.3948451,3.3270298 c -4.6744528,0.2377889 -8.38831516,4.1219028 -8.388392,8.8484012 4.27e-5,4.879327 3.9639804,8.848396 8.8484048,8.848396 3.9774121,0 7.3298611,-2.63728 8.4425171,-6.250733 l -1.772386,0 c -1.041609,2.655978 -3.637326,4.532505 -6.6701311,4.532505 -3.9525393,0 -7.1572002,-3.182786 -7.1572002,-7.130168 7.68e-5,-3.8235827 3.0120819,-6.9648736 6.7919018,-7.157154 0.1111161,-0.00854 0.2307706,-8.55e-5 0.3652984,0 0.1345365,0 0.2542421,-0.00854 0.3652986,0 2.8724905,0.1457472 5.3045375,2.0041726 6.3048325,4.5594859 l 1.78591,0 C 16.24451,6.0963959 13.096937,3.5189685 9.3148623,3.3270298 c -0.1618076,-0.00854 -0.318125,0 -0.4600044,0 -0.1418707,0 -0.298137,-0.00854 -0.4600128,0 z" /><path d="m 18.699132,6.8376828 -1.066968,1.3876293 2.987953,3.0943339 -14.2932341,0 0,1.731805 14.2831241,0 -2.977843,3.094329 1.066968,1.367309 5.327592,-5.327498 z" />'*/
    },
    eval: function(att) { return this[att] ? this[att] : ''; },
    uuid: function(str) {
        if (str) return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
        else return _s4() + _s4() + '-' + _s4() + '-' + _s4() + '-' +
            _s4() + '-' + _s4() + _s4() + _s4();
    },
    _s4: _s4,

    /**
     * Auxiliary function for parsing a range in string format.
     * 
     * @param {string} str - The range in string format
     * @return {Object} The parsed range
     */
    range: function(str) {

        var re = /\[\s*(\d*)\s*:\s*(\d*)\s*\]/;
        if (!re.test(str)) return null;
        var search = re.exec(str);
        var min = search[1].trim();
        var max = search[2].trim();
        min = min ? Number.parseInt(min) : 0;
        max = max ? Number.parseInt(max) : null;
        //if (min > max) return null;
        return { min: min, max: max };
    },

    /**
     * Obtains the component with the specified path.
     * 
     * @param {Object} components - The components main table
     * @param  {...String} paths - The paths ('.' and '..' are supported)
     */
    findComponentByPath(components, ...paths) {
        if (!paths.length)
            throw new Error(
                "Error finding component: no path/s were specified"
            );
        let componentPath = paths[0];
        for (let i = 1; i < paths.length; i++) {
            componentPath +=
                this.PATH_SEPARATOR + paths[i];
        }
        // - fast check: look for nested component in components table
        let component = components[componentPath];
        if (component) return component;

        // - if not found then make slow check: traverse
        //   the table sequentially
        let subpaths = componentPath.split(this.PATH_SEPARATOR);
        let acumPath = subpaths.shift();
        let prevPath = "";
        while (subpaths.length) {
            if (subpaths[0] == ".") {
                subpaths.shift();
            } else if (subpaths[0] == "..") {
                acumPath = prevPath;
                subpaths.shift();
            } else if (components[`${acumPath}${this.PATH_SEPARATOR}${subpaths[0]}`]) {
                prevPath = acumPath;
                acumPath += `${this.PATH_SEPARATOR}${subpaths.shift()}`;
            } else if (components[subpaths[0]]) {
                prevPath = acumPath;
                acumPath = subpaths.shift();
            } else throw new Error(
                `Error finding component: component ${componentPath} not found`
            );
        }
        return components[acumPath];

        /*if (!component)
            throw new Error(
                `Error finding component: component ${componentPath} not found`
            );
        else*/
    },

    /**
     * Obtains the component associated to the specified route.
     * A route is a sequence of subcomponents/connectors.
     * 
     * @param {Object} components - The components main table
     * @param  {...String} routes - The routes
     */
    findComponentByRoute(components, ...routes) {
        let path = this.route2Path(components, ...routes);
        return components[path];
    },

    /**
     * Obtains the parent route.
     * 
     * @param {...String} subroutes - The route
     */
    parentRoute(...subroutes) {
        let route = this.route(...subroutes);
        subroutes = route.split(this.PATH_SEPARATOR);
        return subroutes.slice(0, -1).join(this.PATH_SEPARATOR);
    },

    /**
     * Obtains the last child of the specified route.
     */
    routeChild(...subroutes) {
        let route = this.route(...subroutes);
        subroutes = route.split(this.PATH_SEPARATOR);
        return subroutes[subroutes.length - 1];
    },

    /**
     * Composes a route given a sequence of subroutes
     * 
     * @param  {...String} subroutes  - The sequence of subroutes
     */
    route(...subroutes) {
        //console.log(`[common] route(${JSON.stringify(subroutes)})`);
        // - compose route
        let route = subroutes[0];
        for (let i = 1; i < subroutes.length; i++) route += this.PATH_SEPARATOR + subroutes[i];
        return route;
    },

    /**
     * Transforms the given route to the component path beginning
     * from the specified component path.
     * 
     * @param {Object} components - The components main table
     * @param {String} routes - The route to translate
     */
    route2Path(components, ...routes) {
        //console.log(`[common] route2Path(${JSON.stringify(routes)})`);
        if (!routes.length) throw new Error("Incorrect route: route not specified");

        // - compose route
        let route = this.route(...routes);

        // - break in subpaths
        let subpaths = route.split(this.PATH_SEPARATOR);

        let path = subpaths[0];
        _.each(subpaths.slice(1), (subpath) => {
            if (!components[path]) {
                // - the path does not exist, give a chance to lib @core components
                let lastSubpath = path.split(this.PATH_SEPARATOR).slice(-1)[0];
                if (components[lastSubpath]) {
                    // - we found a lib @core component, modify path with new root
                    path = lastSubpath;
                } else throw new Error(`Incorrect route: component path ${path} not found`);
            }
            // - look for next hop
            let subcomp, con;
            subcomp = _.find(components[path].subcomponents, (val, key) => key == subpath);
            if (!subcomp) con = _.find(components[path].connectors, (val, key) => key == subpath);
            if (!subcomp && !con) throw new Error(`Incorrect route: neither subcomponent nor connector ${subpath} were found`);

            let type = subcomp? subcomp.type: con.type;
            if (type != ".") {
                path += `${this.PATH_SEPARATOR}${type}`;
            }

        });
        if (!components[path]) {
            // - the path does not exist, give a chance to lib @core components
            let lastSubpath = path.split(this.PATH_SEPARATOR).slice(-1)[0];
            if (components[lastSubpath]) {
                // - we found a lib @core component, modify path with new root
                path = lastSubpath;
            } else throw new Error(`Incorrect route: component path ${path} not found`);
        }
        return path;
    },
    log(msg) {
        //console.log(msg);
    }


};