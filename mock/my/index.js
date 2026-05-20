import getServiceList from './getServiceList';
import getPersonalInfo from './getPersonalInfo';
import getUserSocial from './getUserSocial';

export default [getServiceList, getPersonalInfo, ...getUserSocial];
