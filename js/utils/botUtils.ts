import { E621ValidationError } from './e621utils';

export const errorReply = (validationError: E621ValidationError) => {
  let errorResponse = '';

  switch (validationError) {
    case 'INCOMPLETE_INFO':
      errorResponse =
        'Your info is incomplete! Please finish setting it up n try again :3';
      break;
    case 'INVALID_INFO':
      errorResponse =
        'Your info is bunk ;c please check its accuracy and try again.';
      break;
    case 'UNKNOWN':
    default:
      errorResponse =
        "Something isn't right :o I dunno what's wrong but check all your stuff n try again!";
      break;
  }

  return errorResponse;
};
