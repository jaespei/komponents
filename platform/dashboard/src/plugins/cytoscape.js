/*import VueCytoscape from 'vue-cytoscape'
import Vue from 'vue'

Vue.use(VueCytoscape)
*/

import cytoscape from "cytoscape"
import cxtmenu from 'cytoscape-cxtmenu';
//import cola from 'cytoscape-cola';
import Vue from 'vue'

Vue.prototype.$cytoscape = cytoscape;
Vue.prototype.$cytoscape.use(cxtmenu);
//Vue.prototype.$cytoscape.use(cola);