import Vue from 'vue'
import Router from 'vue-router'
import TheDashboardPage from '@/pages/TheDashboardPage'
import TheComponentsPage from '@/pages/TheComponentsPage'
import TheComponentPage from '@/pages/TheComponentPage'
import TheDeploymentsPage from '@/pages/TheDeploymentsPage'
import TheDeploymentPage from '@/pages/TheDeploymentPage'
import TheVolumesPage from '@/pages/TheVolumesPage'
import TheDomainPage from '@/pages/TheDomainPage'
import TheDomainsPage from '@/pages/TheDomainsPage'

/*import TheUsersPage from '@/components/TheUsersPage'*/

Vue.use(Router)

export default new Router({
    routes: [{
            path: '/dashboard',
            name: 'TheDashboardPage',
            component: TheDashboardPage
        },
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
            path: '/deployments',
            name: 'TheDeploymentsPage',
            component: TheDeploymentsPage
        },
        {
            path: '/deployments/:id',
            name: 'TheDeploymentPage',
            component: TheDeploymentPage,
            props: true
        },
        {
            path: '/volumes',
            name: 'TheVolumesPage',
            component: TheVolumesPage
        },
        {
            path: '/domains',
            name: 'TheDomainsPage',
            component: TheDomainsPage
        },
        {
            path: '/domains/:id',
            name: 'TheDomainPage',
            component: TheDomainPage,
            props: true
        },
        /*{
            path: '/users',
            name: 'TheUsersPage',
            component: TheUsersPage
        },*/
        {
            path: '/',
            redirect: '/components'
        }
    ]
})