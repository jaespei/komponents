import 'jointjs/dist/joint.core.css';

import { dia } from 'jointjs/src/core.mjs';
import * as standard from 'jointjs/src/shapes/standard.mjs';
import * as basic from 'jointjs/src/shapes/basic.mjs';
import * as devs from 'jointjs/src/shapes/devs.mjs';


/*export default {
    install: function(Vue) {
        let joint = { dia };
        joint.shapes = { standard, basic, devs };
        Object.defineProperty(Vue.prototype, '$joint', { value: joint });
    }
};*/

let joint = { dia };
joint.shapes = { standard, basic, devs };
Object.defineProperty(Vue.prototype, '$joint', { value: joint });