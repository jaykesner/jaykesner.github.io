import React from "react";
import Layout from "../components/layout";
import { StaticImage } from "gatsby-plugin-image";

const IndexPage = () => {
  return (
    <Layout pageTitle="Hello!">
      <p>I'm making this by following the Gatsby Tutorial.</p>
      <StaticImage
        alt="Paulius Dragunas."
        src="../images/paulius-dragunas.jpg"
      />
    </Layout>
  );
};

export default IndexPage;
