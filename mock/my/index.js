import getServiceList from './getServiceList';
import getPersonalInfo from './getPersonalInfo';
import getUserSocial from './getUserSocial';
import getUserProfile from './getUserProfile';

export default [getServiceList, getPersonalInfo, ...getUserSocial, ...getUserProfile];
