import basiq from '@api/basiq';

basiq.auth(
  'Basic NjMxMjNmMWMtZjYxMy00ZjMyLWFiYzUtYzBhZDdhYTY2YmU1OjQ3NWYwMzhkLTBlZmItNGM1ZS1iMzQ0LTAzMzYxOTkyYTRlMw=='
);

const getBasicAccessToken = async (userId: string) => {
  basiq
    .postToken()
    .then(({ data }) => console.log(data))
    .catch((err) => console.error(err));
};
