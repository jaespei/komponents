import Vue from 'vue'
import Router from 'vue-router'
import TheComponentsPage from '@/pages/TheComponentsPage'
import TheComponentPage from '@/pages/TheComponentPage'

Vue.use(Router)

export default new Router({
    routes: [
        {
            path: '/components',
            name: 'TheComponentsPage',
            component: TheComponentsPage
        },
        {
            path: '/components/:id',
            name: 'TheComponentPage',
            component: TheComponentPage,
            props: true
        },
        {
            path: '/',
            redirect: '/components'
        }
    ]
})