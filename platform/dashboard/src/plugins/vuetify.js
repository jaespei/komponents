import Vue from 'vue';
import Vuetify from 'vuetify/lib/framework';
import SvgIcon from '@/components/SvgIcon';

Vue.use(Vuetify);

export default new Vuetify({
    icons: {
        values: {
            'myicon': {
                component: SvgIcon,
                props: {
                    name: "mdi-home"
                }
            },
            'myicon2': {
                component: SvgIcon,
                props: {
                    name: "mdi-database"
                }
            }
        }
    }
});
